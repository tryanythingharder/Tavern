# 真实实现落地方案（原型 → 生产）

原型已经把**产品形态、交互语义与能力清单**定型（见 `DEV-CONSTRAINTS.md`）。这份文档把它映射成真实系统的技术方案：前端路由、后端接口、数据模型、生成流水线、交付顺序。**它不是原型的一部分，也不改原型任何代码**——原型继续作为可点、可对照的验收基准。

> 前提约束：模型调用、TTS、生图、向量检索、多用户账号、支付都必须有服务端；原型里的对应能力目前是模拟（清单见 DEV-CONSTRAINTS §10），真实实现按那张表逐项替换。

---

## 1. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | **Next.js（App Router）+ TypeScript** | 发现页/广场/角色页需要 SEO 与分享预览；对话页走客户端渲染；一套框架覆盖两种渲染需求 |
| 样式 | **保留原型的 CSS 设计系统**（`--ca-*` 令牌 + 组件类），按模块拆成 CSS Modules | 原型的设计语言已经过验收，换 Tailwind 会重做视觉；令牌直接复用 |
| 状态 | 服务端数据用 TanStack Query，会话内 UI 状态用 Zustand | 避免把 sessionStorage 那套手工同步搬进生产 |
| 后端 | **Node + Fastify + TypeScript**（独立服务） | 与前端共享类型；流式生成、队列、上传都在同一语言栈 |
| 数据库 | **PostgreSQL + pgvector** | 关系数据 + 向量检索（RAG）一个库解决；省掉独立向量库 |
| 缓存/限流 | Redis | 会话、速率限制、生成锁 |
| 对象存储 | S3 兼容（头像、封面、角色卡 PNG、场景图） | 图片不进数据库 |
| 队列 | BullMQ（Redis） | 生图、TTS、embedding 等异步任务 |
| 认证 | 邮箱 + 密码（argon2）+ 可选 OAuth | 与原型账号页面对应 |
| 部署 | 前端 Vercel/自托管 Node；后端容器 + Postgres + Redis + S3 | 生成走 SSE，需长连接，后端不要放 Serverless |

**不建议**：直接在原型上接后端（DOM 手写逻辑与 sessionStorage 会成为负债）；也不要搬 SillyTavern 的代码（jQuery 全局、服务端耦合，见对话记录里的结论）。

---

## 2. 前端路由（对齐原型的 12 个页面）

| 路由 | 对应原型 | 渲染 | 说明 |
|---|---|---|---|
| `/` | `home.html` | SSR + 客户端交互 | 发现页（经典/影院双模式），首屏推荐数据服务端渲染 |
| `/plaza` | `plaza.html` | SSR | 广场，筛选/排序走 URL query 以便分享 |
| `/c/[id]` | `character.html` | SSR | 角色详情；公开字段可被搜索引擎收录 |
| `/a/[name]` | `author.html` | SSR | 作者主页 |
| `/chats` | `chats.html` | CSR | 会话列表 |
| `/chats/[id]` | `chat.html` | CSR | 对话页；生成走 SSE |
| `/rooms`、`/rooms/[id]` | `rooms.html` / 房间会话 | CSR | 多角色房间 |
| `/library` | `library.html` | CSR | 角色库 |
| `/create`、`/create/[id]` | `create.html` | CSR | 创作；草稿自动保存 |
| `/me` | `settings.html` | CSR | 设置（含备份、点数、安全） |
| `/notifications` | `notifications.html` | CSR | 通知 |
| `/admin/*` | `admin.html` | CSR（独立权限） | 后台，单独打包按需加载 |
| `/login` | `login.html` | SSR | 认证 |

- 视图模式（经典/影院）继续存客户端，切换不刷新（对应 DEV-CONSTRAINTS §1 的 SPA 要求）。
- 原型里「页面级预取 + 淡入」在生产由路由预取与 View Transitions 替代。

---

## 3. 后端接口清单（按原型能力推导）

约定：`/api/v1`，鉴权用 HttpOnly Cookie 会话；写操作返回最新版本号，客户端用 `If-Match` 做并发控制。

### 认证与账号
- `POST /auth/register`、`POST /auth/login`、`POST /auth/logout`、`POST /auth/password/forgot`
- `GET/PATCH /me`（昵称、偏好、字体缩放、聊天背景、视图模式）
- `GET /me/devices`、`DELETE /me/devices/:id`
- `GET/POST /me/export`（个人数据导出）、`POST /me/import`（备份恢复，带格式校验）
- `GET /me/points`、`GET /me/points/ledger`（分页；分项：text/image/voice）

### 角色与内容
- `GET /characters`（筛选/排序/游标分页；排除屏蔽作者）、`GET /characters/:id`
- `POST /characters`、`PATCH /characters/:id`、`DELETE /characters/:id`
- `GET /characters/:id/versions`、`POST /characters/:id/publish`（送审）、`POST /characters/:id/import`（V2/V3 JSON/PNG 卡）
- `GET /characters/:id/export?format=json|png`（PNG 需服务端嵌入 `chara`/`ccv3`）
- `GET /authors/:name`、`GET /authors/:name/works`
- `GET/POST /characters/:id/comments`、`DELETE /comments/:id`
- `POST /characters/:id/library`（添加/收藏）、`DELETE /characters/:id/library`
- `POST /moderation/reports`（角色/作者/评论）、`GET /me/reports`

### 会话
- `GET /chats`、`POST /chats`、`GET /chats/:id`、`PATCH /chats/:id`（重命名/身份切换）、`DELETE /chats/:id`
- `POST /chats/:id/messages`（发送 → 触发生成）、`PATCH /messages/:id`、`DELETE /messages/:id`
- `POST /messages/:id/candidates`（重新生成）、`POST /messages/:id/candidate`（切换候选）
- `POST /chats/:id/branch`（从第 N 条分支）、`GET /chats/:id/branches`
- `POST /chats/:id/bookmarks`、`DELETE /chats/:id/bookmarks/:messageId`
- `GET /chats/:id/search?q=`（全文检索，Postgres `tsvector` + 中文分词）
- `GET /chats/:id/export?format=jsonl|txt`、`POST /chats/import`（jsonl 互通 ST）
- `GET /chats/:id/backups`、`POST /chats/:id/backups/:at/restore`

### 房间（群聊）
- `GET /rooms`、`POST /rooms`、`GET /rooms/:id`、`PATCH /rooms/:id`（策略/静音/自动推进）、`DELETE /rooms/:id`
- `POST /rooms/:id/messages`（按激活策略调度多角色生成）

### 生成（核心）
- `POST /chats/:id/generate`：SSE 流式返回；事件 `delta` / `done` / `error`；支持 `stop`
- `POST /chats/:id/continue`、`POST /chats/:id/impersonate`
- `GET /chats/:id/context-preview`（服务端组装结果 + 分块 token，只读）

### 设定资源
- 世界书：`GET/POST /lorebooks`、`PATCH/DELETE /lorebooks/:id`、`POST /lorebooks/import`
- 预设：`GET/POST /presets`（含 params 12 项、contextTemplate、instruct、order）、`POST /presets/import`
- 正则：`GET/POST /regex`（scope/placement/深度范围）、`POST /regex/import`
- 快捷回复：`GET/POST /quick-replies`
- 身份：`GET/POST /personas`、`PATCH/DELETE /personas/:id`
- 记忆：`GET/PATCH /chats/:id/summary`、`POST /chats/:id/summary/refresh`、`GET/PATCH /chats/:id/rag`

### 通知、点数、后台
- `GET /notifications`、`POST /notifications/read`、`GET /announcement`（公开）
- 后台：审核队列、举报处理、公告、玩家、订单、卡密、邀请码、网关、渠道、审计（对齐原型后台模块）

---

## 4. 数据模型（核心表）

```
users(id, email, password_hash, nickname, role, status, created_at)
user_prefs(user_id, font_scale, chat_bg, view_mode, hide_status_block, context_advanced_open)
personas(id, user_id, name, description, position, depth, role, bound_characters[])
characters(id, owner_id, name, hook, description, personality, scenario, instructions,
           first_message, alternate_greetings[], mes_example, tags[], category, nsfw,
           status[draft|pending|published|rejected], revision, source_card jsonb, created_at)
character_versions(id, character_id, revision, snapshot jsonb, created_at)
chats(id, user_id, character_id, character_snapshot jsonb, title, opening, persona_id,
      preset_id, summary jsonb, summary_prefs jsonb, rag_prefs jsonb, branch_source jsonb,
      created_at, updated_at)
messages(id, chat_id, role, speaker_id, text, candidates jsonb, selected_candidate,
         hidden, bookmark, persona_snapshot jsonb, simulation, created_at, seq)
rooms(id, user_id, name, members[], muted[], strategy, speaker_id, auto_mode, snapshot jsonb)
room_messages(...)            -- 与 messages 同构，speaker_id 必填
lorebooks(id, user_id, name, entries jsonb)
presets(id, user_id, name, system, jailbreak, params jsonb, context_template,
        instruct jsonb, order jsonb, custom jsonb)
regex_rules(id, user_id, name, find, replace, scope, placement, depth_from, depth_to, enabled)
quick_replies(id, user_id, items jsonb)
points_ledger(id, user_id, kind[text|image|voice|recharge|redeem], amount, balance_after,
              ref_id, created_at)
usage_events(id, user_id, chat_id, kind, prompt_tokens, completion_tokens, cost, created_at)
notifications(id, user_id, type, title, body, link, read_at)
reports(id, reporter_id, target_type, target_id, reason, note, status, handled_by, handled_at)
audit_log(id, actor_id, action, target, detail jsonb, created_at)
chat_backups(id, chat_id, message_count, payload jsonb, created_at)   -- 自动快照
embeddings(id, chat_id, message_id, chunk, embedding vector(1536))     -- pgvector
```

索引要点：`messages(chat_id, seq)`、`chats(user_id, updated_at desc)`、`characters(status, tags)`、`embeddings USING ivfflat`。

---

## 5. 生成流水线（把原型的本地组装搬到服务端）

1. **组装**：服务端移植原型的 `assemblePrompt` 语义——块顺序与开关、世界书 `scanLore`（含递归/定时效果/深度插入）、作者注释位置、上下文模板、Instruct 序列、自动摘要、记忆检索（向量版）、token 预算与历史截断。原型里的函数名与语义就是规格。
2. **采样参数**：按预设 12 项下发到网关；不同供应商映射见网关适配层。
3. **流式**：SSE 推送 delta；客户端保留「候选」机制——每次生成写入 `messages.candidates`，切换候选只改 `selected_candidate`。
4. **计量**：按 `usage_events` 记账，点数扣减以 `points_ledger` 为准（原型点数面板的「分项」就是这张表的聚合）。
5. **异步能力**：生图/TTS 走队列，任务完成后以消息附件或系统消息回填。
6. **摘要与向量**：发送 N 轮后入队摘要任务；消息写入时异步算 embedding（pgvector）。

---

## 6. 复用与重写清单

**直接复用**：
- `proto.css` / `platform*.css` / `immersive.css` 的设计令牌与组件视觉（按页面拆 CSS Modules）。
- 全部文案与交互规格（`DEV-CONSTRAINTS.md` 的导航、弹层、侧栏、模拟边界清单）。
- 测试思路：原型的行为测试改成 Playwright 端到端 + 接口契约测试。

**必须重写**：
- `platform.js` 的单体 IIFE → 组件 + 数据层（禁止继续 DOM 手写渲染）。
- sessionStorage 存档 → 服务端 API + 本地草稿缓存（离线可写、联网同步）。
- 正则/世界书等编辑器 → 保留交互，数据走 API。

---

## 7. 交付阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 | 前端骨架（路由、设计系统、布局）+ 认证 + 角色浏览（只读） | 发现/广场/角色页可访问、可登录 |
| M1 | 会话与生成（单聊）：发送、流式、候选、编辑、删除、分支 | 端到端能真正对话，token 计量正确 |
| M2 | 设定系统：世界书、预设（含采样/模板/Instruct）、正则、身份、快捷回复 | 与 ST 预设/世界书导入互通 |
| M3 | 长线能力：摘要、向量检索、书签搜索、备份恢复、导出（jsonl/txt） | 长会话上下文不丢、可回退 |
| M4 | 房间/群聊、通知、点数与充值、审核与后台、生图/TTS | 多角色调度正确、计费可对账 |

每阶段完成时删掉对应行的「模拟标注」（DEV-CONSTRAINTS §10），并把 `tests/rp-copy.test.cjs` 的守卫项改成「该能力已接入」的断言。

---

## 8. 需要先定的决策点

1. **模型供应商与成本模型**：文本/生图/语音分别用谁，如何限流与降级（这决定点数定价）。
2. **内容政策**：NSFW 的展示边界、审核是人工还是模型、未成年保护策略（原型里 `18+` 遮罩只是界面）。
3. **数据留存与隐私**：会话加密、导出与删除（GDPR 类要求）、备份保留期。
4. **社区运营**：评论、举报、作者主页是否需要先做审核后公开。

---

*本文档只描述真实实现路径，不改变原型。原型继续作为设计与交互的验收基准。*

---

## 9. 商业平台功能缺口（2026-11-09 评估）

原型已经把**玩家侧的核心 RP 体验**做到位（发现→角色→对话→长线记忆→创作→房间→社区雏形）。但作为一款**商业**产品，下面这些是「能上线收费」与「演示」之间的差距。按优先级排：

### P0 · 合规与信任（没有这些不能收费）

| 缺口 | 现状 | 需要做 |
|---|---|---|
| 自有服务条款 / 隐私政策 | 登录页目前链到 SillyTavern 的 `terms.html` | 写自己的 ToS、隐私政策、社区准则；注册时明确同意与年龄声明 |
| 年龄门槛 | 仅 18+ 遮罩与声明 | 注册时年龄确认（必要时第三方验证）；未成年人保护策略 |
| 内容分级执行 | NSFW 开关只是界面遮罩 | 分级字段贯穿搜索/推荐/分享预览；未成年人账号强制过滤 |
| 举报处理闭环 | 举报只写本地 | 举报入库、SLA、处理结果通知举报人、申诉入口、封禁/解除 |
| 侵权与下架 | 无 | DMCA/侵权投诉通道、下架流程、创作者申辩 |
| 审核后台 | 后台是静态示例 | 真实审核队列（图文）、批量操作、操作审计、权限分级 |

### P1 · 商业化（收费能力）

| 缺口 | 说明 |
|---|---|
| 订阅档位 | 月/年订阅（如：更高上下文、更多生图额度、去广告），与点数并行 |
| 支付与账务 | 支付网关、订单、发票/收据、退款、自动续费、失败重试、对账 |
| 点数经济 | 分项计费（文本/生图/语音）、余额不足引导、赠送与过期策略、防刷 |
| 创作者分成 | 付费角色或打赏、分成比例、结算周期、税务信息 |
| 优惠与增长手段 | 优惠码、首充礼、邀请奖励（后台已有邀请码，玩家端无入口） |

### P1 · 创作者工具（供给端决定平台天花板）

| 缺口 | 说明 |
|---|---|
| 作品版本历史 UI | 原型已实现「保存留快照 + 版本列表 + 恢复」（每作品 5 版）；真实版本需服务端持久化与对比视图 |
| 创作者数据面板 | 浏览量、会话数、留存、转化（收藏/开聊比）、评价趋势 |
| Remix / 二次创作 | 从他人角色派生（带署名与授权开关），现在只有「复制为分支」在会话层 |
| 草稿与发布流程 | 有草稿/送审状态，缺审核意见、修改后重提、定时发布 |
| 角色卡质量校验 | 导入时只校验必填，缺字段完整度评分与提示 |

### P2 · 增长与留存

| 缺口 | 说明 |
|---|---|
| 新手引导 | 首次进入的 3 步引导（选角色→发第一句→看设定），现在直接落到发现页 |
| 签到 / 连续奖励 | 每日点数、连续天数、任务 |
| 关注作者与动态 | 作者主页有，但没有「关注」和「新作推送」 |
| 通知偏好 | 站内通知有，缺邮件/推送开关与频率控制 |
| 分享卡片 | 角色链接分享时的 OG 图与文案（角色封面 + 一句话钩子） |
| 排行榜与合集 | 热门/新作/上升榜，官方或玩家合集（「雨夜故事」这类策展） |

### P2 · 搜索与发现质量

| 缺口 | 说明 |
|---|---|
| 中文搜索 | 现在前端 `includes` 过滤；需要分词、同义词、拼音 |
| 筛选组合 | 题材+标签+长度+语言+是否 NSFW 的组合筛选与保存 |
| 相似推荐 | 「喜欢这个角色的人也聊过」 |
| 冷启动排序 | 现在按固定顺序，需要质量分（完读率、收藏率、举报率） |

### P2 · 模型层与成本

| 缺口 | 说明 |
|---|---|
| 多模型选择 | 每个会话可选模型/供应商，按档位限制 |
| 成本控制 | 上下文预算、缓存命中、长会话摘要降本、失败重试与降级 |
| 流式健壮性 | 断线重连、生成中断恢复、超时与取消 |
| 输入输出过滤 | 敏感内容拦截、Prompt 注入防护、模型输出合规检查 |

### P3 · 工程与体验

| 缺口 | 说明 |
|---|---|
| 多端 | PWA（可安装 + 离线草稿）、后续原生 App 与推送 |
| 国际化 | 至少中英双语；文案抽取与日期/数字格式 |
| 无障碍 | 键盘全流程、读屏标签、对比度、减少动效（部分已有） |
| 可观测性 | 前端错误上报、接口监控、生成成功率与延迟看板 |
| 数据权利 | 账号删除（有入口未实现）、数据导出（有）、数据保留策略 |

### 建议的上线节奏

1. **先闭环合规**（ToS/隐私/年龄/举报/审核）——没有它不能收钱。
2. **再做订阅 + 点数**，同时上**创作者分成**（供给端是 RP 平台的生命线）。
3. **然后做增长**（引导、签到、关注、分享卡片）与**搜索质量**。
4. 模型层与多端在用户量起来后再投。

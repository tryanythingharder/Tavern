# 酒馆 · 真实实现（M5）

原型（`../prototype/`）已经定型了产品形态与交互语义；这里是按 [IMPLEMENTATION-PLAN.md](../prototype/IMPLEMENTATION-PLAN.md) 落地的真实应用。**M5 已实现**：M1 单聊 + M2 设定系统 + M3 长线能力 + M4 房间/群聊、点数、通知、后台、生图/TTS、充值、审核 + M5 创作、评论、搜索。

## 运行

```bash
npm install
npm run dev     # http://localhost:3100
npm run build && npm start
```

## M1 完成范围（2026-11-09）

| 内容 | 状态 |
|---|---|
| SQLite（`node:sqlite`，零依赖）建表：users / sessions / characters / chats / messages | ✅ |
| 真实认证：邮箱 + 密码（scrypt 哈希）+ 数据库会话 + HttpOnly cookie | ✅ |
| 角色页「开始新故事」→ 建会话（写入开场白）→ 跳转对话页 | ✅ |
| 对话页：发送 → SSE 流式渲染 → 落库；刷新后保留；会话列表带最后一条消息 | ✅ |
| 模型接入：OpenAI 兼容 `/chat/completions`，`reasoning_content` 与正文分离（只显示正文） | ✅ |
| 中断生成：保留已生成部分并落库（`AbortController`）；中断后客户端与数据库自动对齐 | ✅ |
| 消息操作：编辑（角色消息只改当前候选）、删除、从任意一条分支 | ✅ |
| 重新生成：新结果追加为候选，旧候选保留，`‹ 1/2 ›` 来回切换 | ✅ |
| token 计量：网关 `usage` 落 `generation_events`（网关没回时按字数估算并标记） | ✅ |
| 限流：每用户每分钟次数上限 + 每日 token 上限，超限 429 且不吞用户草稿 | ✅ |
| `/me` 生成用量：今日次数 / 输入 / 输出 / 累计 + 当前配额 | ✅ |

环境变量只走 `.env.local`（已 gitignore）：

```
TAVERN_MODEL_BASE_URL=https://…/v1
TAVERN_MODEL_API_KEY=…
TAVERN_MODEL_NAME=…

# 可选：生成配额（默认 12 次/分钟、200,000 tokens/天；每日上限设 0 表示不限）
TAVERN_RATE_PER_MIN=12
TAVERN_DAILY_TOKEN_CAP=200000
```

**密钥不进代码、不进提交**。轮换密钥后只需改 `.env.local` 并重启。

接口一览（都要求登录，并按会话归属校验）：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chats/[id]/messages` | 发送并流式生成（SSE：delta / done / error） |
| GET | `/api/chats/[id]/messages` | 取消息（中断/失败后对齐用） |
| POST | `/api/messages/[id]/regenerate` | 重新生成角色消息，追加候选（SSE） |
| POST | `/api/messages/[id]/candidate` | 切换候选 `{index}` |
| PATCH / DELETE | `/api/messages/[id]` | 编辑 / 删除消息 |
| POST | `/api/chats/[id]/branch` | 从某条消息分支出新会话 `{messageId}` |

M2 设定资源接口（都需要登录，按 `user_id` 隔离）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/presets` | 预设列表 / 新建（首次访问自动建默认预设） |
| GET/PATCH/DELETE | `/api/presets/[id]` | 读取 / 修改 / 删除 |
| POST | `/api/presets/import` | 导入 ST 预设 `{json}` |
| GET/POST | `/api/lorebooks` | 世界书列表 / 新建 |
| GET/PATCH/DELETE | `/api/lorebooks/[id]` | 读取 / 修改（整本条目）/ 删除 |
| POST | `/api/lorebooks/import` | 导入 ST 世界书 `{json}` |
| GET/POST | `/api/regex` | 正则列表 / 新建 |
| PATCH/DELETE | `/api/regex/[id]` | 修改 / 删除 |
| POST | `/api/regex/import` | 导入 ST 正则 `{json}` |
| GET/POST | `/api/personas` | 身份列表 / 新建 |
| PATCH/DELETE | `/api/personas/[id]` | 修改 / 删除 |
| GET/POST | `/api/quick-replies` | 快捷回复列表 / 新建 |
| DELETE | `/api/quick-replies/[id]` | 删除 |
| GET/PATCH | `/api/chats/[id]/settings` | 会话设定（`lorebookIds: null` = 全部世界书，`[]` = 一本都不用） |
| GET | `/api/chats/[id]/context-preview` | 上下文预览（块、token、命中、最终消息） |

M3 长线能力接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/PATCH | `/api/chats/[id]/memory` | 摘要状态与设置、检索设置、手动记忆；`{refresh:true}` 立即刷新摘要 |
| GET | `/api/chats/[id]/search?q=&bookmarks=1` | 聊天内搜索 / 书签列表 |
| PATCH | `/api/messages/[id]` | `{bookmark:true}` 切换书签（也接受 `{content}` 编辑） |
| GET/POST | `/api/chats/[id]/backups` | 快照列表 / 手动留一份 |
| POST | `/api/chats/[id]/backups/[backupId]/restore` | 恢复快照（恢复前自动留现场） |
| GET | `/api/chats/[id]/export?format=txt\|jsonl` | 下载整段对话 |
| GET | `/api/cards` | 当前用户的全部角色卡覆盖 |
| PUT/DELETE | `/api/cards/[characterId]` | 保存 / 清除某个角色的卡内提示词 |

M4 房间 / 点数 / 通知 / 后台接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/rooms` | 房间列表 / 新建 `{name, characterIds, strategy}` |
| GET/PATCH/DELETE | `/api/rooms/[id]` | 读取 / 改名·成员·静音·策略 / 删除 |
| GET | `/api/rooms/[id]/messages` | 房间消息 |
| POST | `/api/rooms/[id]/messages` | 发送并生成（SSE：speaker / delta / done / error） |
| GET | `/api/notifications` | 通知列表 + 未读数 |
| POST | `/api/notifications/read` | 全部标为已读 |
| POST | `/api/admin/grant` | 管理员赠点 `{userId, amount, note}` |
| POST | `/api/chats/[id]/image` | 生图 `{prompt}`，作为消息附件（未配置返回 503） |
| POST | `/api/messages/[id]/tts` | 把角色消息合成语音，挂回该消息 |
| POST | `/api/codes/redeem` | 兑换码 `{code}` |
| GET/POST | `/api/orders` | 我的订单 / 创建待支付订单 `{points}` |
| POST | `/api/admin/orders/[id]/pay` | 管理员确认到账（写账本 + 通知） |
| POST | `/api/payments/webhook` | 支付回调 `{orderId, signature}`（HMAC 验签） |
| POST | `/api/reports` | 举报 `{targetType, targetId, reason, note}` |
| POST | `/api/admin/reports/[id]/resolve` | 处理举报 `{action: resolved\|dismissed}` |
| POST | `/api/admin/users/[id]/status` | 封禁 / 解封 `{status}` |
| POST | `/api/admin/codes` | 生成兑换码 `{amount, count, note}` |

M5 创作 / 评论 / 搜索接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/characters` | 创建角色 |
| PATCH/DELETE | `/api/characters/[id]` | 编辑 / 删除自己的角色 |
| GET/POST | `/api/characters/[id]/comments` | 评论列表 / 发布 |
| DELETE | `/api/comments/[id]` | 删除自己的评论（管理员可删任意） |
| GET | `/search?q=` | 角色搜索页（顶栏搜索框直达） |
| GET/POST | `/api/checkin` | 签到状态 / 领取当天点数 |

## 合规基础（2026-11-09）

| 内容 | 状态 |
|---|---|
| 服务条款 / 隐私政策 / 社区准则三个页面（模板文本，标注需法务审核） | ✅ |
| 注册时年龄确认：必选勾选 + 服务端校验，记录 `age_confirmed_at` | ✅ |
| 18+ 列表过滤：用户偏好 `hide_nsfw`（默认显示），作用于发现页、广场、搜索 | ✅ |
| 「我的」里可切换过滤，登录/注册页与「我的」都有条款入口 | ✅ |

接口：`PATCH /api/me/preferences { hideNsfw }`。

## M5 完成范围（2026-11-09）

| 内容 | 状态 |
|---|---|
| 创作：`/create` 写角色（名称、钩子、开场白、描述、节奏、标签、题材、18+），发布后进广场 | ✅ |
| 编辑 / 删除自己的角色（角色页侧栏），「我的角色」列表 | ✅ |
| 角色数据改从数据库读：种子角色 + 自创角色统一在发现页、广场、搜索、开故事里出现 | ✅ |
| 评论：角色页发布 / 删除自己的（管理员可删任意）/ 举报评论 | ✅ |
| 搜索：顶栏搜索框接 `/search`，按名称、钩子、描述、标签、作者匹配 | ✅ |
| 每日签到：基础 10 点，连续每天 +2（最多 +14），`/me/points` 一键领取并写账本 | ✅ |

## M4 完成范围（2026-11-09）

| 内容 | 状态 |
|---|---|
| 房间/群聊：多角色同场，成员静音，发言策略（自然叫名 / 轮流 / 手动 / 随机池） | ✅ |
| 房间提示词：所有成员人设 + 世界书扫描 + 玩家身份 + 「本轮由谁回应」规则 | ✅ |
| 房间对话页：成员头像、策略提示、手动选发言人、生成中显示「谁在输入」 | ✅ |
| 点数账本：`points_ledger` 逐笔记（含 `balance_after`），生成按 token 扣费，可回放对账 | ✅ |
| 新账号赠送点数；余额不足时 402 并提示，余额跌破阈值发通知 | ✅ |
| 点数页：余额、累计消耗/获得、逐笔明细；顶栏常驻余额 | ✅ |
| 通知：站内通知表、顶栏铃铛未读数、通知页、全部已读 | ✅ |
| 最小后台：管理员看用户/余额/今日用量、赠点（会发通知），非管理员 404 | ✅ |
| 导航：侧栏与手机标签栏加入「房间」（6 项），管理员侧栏多一个「后台」 | ✅ |
| 后台「接口配置」：生图 / TTS / 支付网关的运行时配置，存数据库、优先于环境变量，密钥只写不读，可清除 | ✅ |
| 生图 / TTS：OpenAI 兼容的 images / audio 接口，结果存 `public/generated/` 作为消息附件；备份与导出会保留附件 | ✅ |
| 充值：兑换码（管理员批量生成、用户兑换）、订单（创建 → 管理员确认 / webhook 回调 → 入账）、我的订单 | ✅ |
| 审核：角色与消息举报、后台处理队列（已处理/驳回）、处理结果通知举报人、封禁/解封 | ✅ |

环境变量：

```
TAVERN_ADMIN_EMAILS=…      # 管理员邮箱，逗号分隔（也可以用 users.role='admin'）
TAVERN_STARTING_POINTS=500 # 新账号赠送点数
TAVERN_POINTS_PER_1K=2     # 每 1000 tokens 扣多少点

# 可选：生图 / 语音（也可以在后台「接口配置」里填，数据库优先于这里）
TAVERN_IMAGE_BASE_URL / TAVERN_IMAGE_API_KEY / TAVERN_IMAGE_MODEL / TAVERN_IMAGE_SIZE
TAVERN_TTS_BASE_URL / TAVERN_TTS_API_KEY / TAVERN_TTS_MODEL / TAVERN_TTS_VOICE
TAVERN_POINTS_IMAGE=20     # 每张图多少点
TAVERN_POINTS_TTS=5        # 每次语音多少点

# 可选：支付
TAVERN_PRICE_PER_POINT_CENTS=1
TAVERN_PAYMENT_SECRET=…    # webhook 密钥：HMAC-SHA256(orderId|amount|currency|status|timestamp)
TAVERN_PAYMENT_CHECKOUT_URL=… # 托管结算页；跳转带 orderId/points/amount/expires/token（token 不是 webhook 签名）
TAVERN_PAYMENT_CURRENCY=CNY

# 生产安全开关
TAVERN_COOKIE_SECURE=1              # HTTPS 站点必须
TAVERN_REQUIRE_ADMIN_2FA=1          # 管理员未开启 TOTP 时后台不可用
TAVERN_REQUIRE_EMAIL_VERIFY=1       # 未验证邮箱不能生成/发布/评论
TAVERN_GLOBAL_DAILY_TOKEN_CAP=2000000 # 全站每日 token 止损（0=不限）
TAVERN_UPSTREAM_TIMEOUT_MS=120000   # 文本上游超时
TAVERN_MEDIA_TIMEOUT_MS=180000      # 生图/TTS 上游超时
TAVERN_SUPPORT_EMAIL=support@example.com # 帮助与申诉页展示的支持邮箱
TAVERN_UPSTREAM_COST_PER_1K_CENTS=1 # 后台毛利粗算：上游每 1000 tokens 成本（分）

# 可选：邮件（找回密码 / 邮箱验证；也可以在后台「接口配置 · 邮件」里填）
TAVERN_MAIL_RESEND_KEY=…   # Resend API Key
TAVERN_MAIL_FROM='酒馆 <no-reply@example.com>'
TAVERN_MAIL_PREVIEW=1      # 开发时让接口返回 outbox 文件路径（生产不要开）
NEXT_PUBLIC_SITE_URL=https://your-domain  # 邮件里的链接用这个根地址
```

> 生图 / TTS / 支付 / 邮件配置都可以在 `/admin/settings` 里填，保存后立即生效，不需要重启。管理接口只返回「是否已配置」，不会回传密钥。未配置邮件时会写到 `.data/outbox/`，本地可以从那里拿验证/重置链接。

**M4 没做**：真实支付网关的商户签约与回调适配（现在提供通用托管结算页跳转 + HMAC webhook）、评论与创作者工具、举报批量处理与申诉、通知偏好。这些在 IMPLEMENTATION-PLAN §9 里都有清单。

**账号安全（2026-11-10）**：邮箱验证（注册发信 / `/verify` 验证 / 设置页重发）、忘记密码与重置（`/forgot`、`/reset`，令牌 1 小时一次性，重置后退出所有设备）、登录设备列表与退出其他设备、账号注销（密码确认后删除个人数据）。邮件走 Resend，未配置时写 `.data/outbox/`。

## M3 完成范围（2026-11-09）

| 内容 | 状态 |
|---|---|
| 自动摘要：抽取式，每 N 条（4–40）刷新一次，只覆盖「最近 8 条」之前；可手改（改后不再被自动覆盖） | ✅ |
| 记忆检索：字符 bigram 近似，从最近 8 条之前的历史里取 topK（1–5）片段 | ✅ |
| 手动记忆：剧情要点，每轮进入上下文 | ✅ |
| 书签：消息「⋯」里标记；搜索弹窗可只看书签 | ✅ |
| 聊天内搜索：关键词匹配，点结果跳到消息并高亮 | ✅ |
| 备份：每轮结束自动快照（每会话保留 5 份），恢复前先留现场，恢复本身可撤销 | ✅ |
| 导出：txt / jsonl 下载（含候选、书签、时间戳） | ✅ |
| 角色卡字段：system_prompt（支持 `{{original}}`）、post_history_instructions、mes_example、depth_prompt，按用户覆盖 | ✅ |
| 宏：块文本里的 `{{char}}` / `{{user}}` / `{{persona}}` | ✅ |

对话页「设定」现在分三页：**生成**（预设 / 身份 / 世界书 / 上下文预览）、**记忆**（摘要、检索、手动记忆）、**备份与导出**。右上角还有「搜索」。

## M2 完成范围（2026-11-09）

| 内容 | 状态 |
|---|---|
| 预设：系统提示 / 后置提示 / 12 项采样参数 / 上下文模板 / Instruct 序列 / 提示块顺序与开关 / forbid_overrides | ✅ |
| 世界书：关键词（含次要关键词四种逻辑）、常驻、插入位置（角色前/后、历史深度、示例、出口）、深度与身份、优先级、触发概率、递归扫描、预算 | ✅ |
| 正则：发送 / 展示 / 两者，作用对象（全部 / 玩家 / 角色），深度范围 | ✅ |
| 身份：显示名、身份说明、进入位置（身份块 / 历史深度 / 不进上下文）、绑定角色 | ✅ |
| 快捷回复：对话输入框上方的按钮，点一下填入 | ✅ |
| 会话级设定：每个故事单独选预设 / 身份 / 世界书（「全部世界书」或指定几本） | ✅ |
| 上下文预览：块级字符数、token 估算、世界书命中、最终消息，只读不落库 | ✅ |
| ST 导入：预设（采样参数、main/jailbreak、story_string、instruct）、世界书（keys/position/constant/disable/secondary）、正则（placement/markdownOnly） | ✅ |

设定入口：`/me` → 预设 / 世界书 / 正则 / 身份 / 快捷回复；对话页右上角「设定」里选本故事用哪套，并能预览上下文。

**尚未覆盖**（原型里有、但这里先不做，等后续阶段）：变量宏（setvar/getvar）、作者注释、世界书粘滞/冷却/延迟与分组评分、`{{outlet}}` 展开、真正的向量检索（现在是 bigram 近似）。

## M0 完成范围

| 内容 | 状态 |
|---|---|
| Next.js 15 App Router + TypeScript | ✅ |
| 设计令牌（与原型 `proto.css` 对齐）+ 应用壳（侧栏 / 顶栏 / 手机标签栏） | ✅ |
| `/` 发现（SSR）、`/plaza` 广场（筛选走 URL 参数）、`/c/[id]` 角色详情（SSG + OG 元信息） | ✅ |
| `/login` 登录/注册页（M1 已换成真实认证） | ✅ |
| `/chats`、`/create`、`/me` | 后续里程碑已实现（对话、创作、设定与用量） |
| 404 页 | ✅ |

种子角色来自 `data/characters.ts`，首次启动播种进 SQLite；此后角色统一从数据库读（含用户自创角色），发现页、广场、搜索、开故事共用同一份数据。

## 搜索与发现（2026-11-12）

- 顶栏搜索进入 `/search`，是全局搜索：可按「角色 / 作者」切换类型，按题材、相关/最热/最新排序，并在「卡片 / 列表」两种视图间切换；作者结果可直接进入作者主页。
- 广场里的搜索框是**当前广场列表的本地筛选**，输入后会给出「在全部角色和作者中搜索」的跳转，两者不再混用。
- 搜索结果卡固定为 180–220px 宽的多列网格，不会再因为只有一条结果就拉满整行；作者结果单独成组。
- 屏蔽作者、NSFW 偏好和已下架作品在搜索中同样生效。

## 已知边界（需要外部输入或属于上线清单）

- **生图 / TTS**：接口、界面与后台配置页已就绪；填好 base URL / key / 模型后即可用，未配置时按钮隐藏、接口返回 503。
- **支付**：兑换码 + 订单人工确认 + 服务端 webhook 已可用；webhook 使用独立密钥对 `orderId|amount|currency|status|timestamp` 验签并校验金额/币种/10 分钟时间窗，结算页 token 与 webhook 密钥分离。接真实网关仍需商户资质，并把验签规则换成对应网关。
- **合规**：条款 / 隐私 / 准则模板页、注册年龄确认、18+ 列表过滤已就位；正式上线前仍需法务审核文案，并按地区补充数据保留期与未成年人保护策略。
- **创作者工具**：作品版本历史、创作者数据面板、Remix 未实现。
- **增长与搜索质量**：新手引导、签到、关注、分享卡片、中文分词、组合筛选、相似推荐未实现。
- **工程**：PWA、国际化、可观测性未实现；图片仍用原生 `<img>`（`sharp` 的安装脚本未批准）。

## 与原型的关系

- **视觉**：`app/globals.css` 的令牌与组件是从原型 `proto.css` / `immersive.css` 收敛出来的，不重新发明设计。
- **交互规格**：导航、弹层、分区侧栏、模拟边界清单都以 `../prototype/DEV-CONSTRAINTS.md` 为准。
- **验收**：原型仍是可点的验收基准；本应用逐阶段对齐后，删除原型里对应的「模拟」标注。

## 下一阶段（M6）

1. 真实支付网关：把 `/api/payments/webhook` 换成目标网关的验签与订单查询，补退款与对账。
2. 创作者工具：作品版本历史 UI、创作者数据面板、Remix（从他人角色派生）。
3. 搜索与发现质量：中文分词、组合筛选（题材+标签+长度+NSFW）、相似推荐、冷启动排序。
4. 端到端测试（Playwright），把 M1–M5 的验收脚本固化进仓库。

## 生产部署最小清单

**必须配置的环境变量**

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.example   # 邮件链接/OG/安全头依赖它
TAVERN_COOKIE_SECURE=1                              # 生产 HTTPS 必须
TAVERN_MODEL_BASE_URL=https://upstream/v1
TAVERN_MODEL_API_KEY=...
TAVERN_MODEL_NAME=...
TAVERN_ADMIN_EMAILS=you@example.com                # 仅作为已验证邮箱的兜底
TAVERN_REQUIRE_ADMIN_2FA=1                         # 管理员必须开启 TOTP
TAVERN_REQUIRE_EMAIL_VERIFY=1                      # 生成/发布/评论前必须验证邮箱
TAVERN_GLOBAL_DAILY_TOKEN_CAP=2000000              # 全站每日 token 止损
TAVERN_MODEL_FALLBACKS='[{"baseUrl":"https://backup/v1","apiKey":"...","model":"..."}]'  # 可选，备用线路（后台也能填）
```

**管理员初始化**：不要依赖未验证邮箱抢注。先注册并验证管理员账号，再执行：

```bash
node scripts/promote-admin.mjs you@example.com
```

开启 `TAVERN_REQUIRE_ADMIN_2FA=1` 后，管理员必须先到「我的 · 安全与隐私」绑定 TOTP 验证器，否则后台不可用。登录时若已绑定，会先进入 `/login/2fa` 输入 6 位验证码或一次性恢复码。

**文本渠道（后台 → 渠道）**：可建多条 OpenAI 兼容渠道。填 Base URL 与 Key 后点「获取模型」会请求上游 `GET {baseUrl}/models`，勾选模型并指定默认模型即可，不需要手填模型名。渠道按优先级从高到低依次 failover，可在列表里单条测试、停用、删除。只要建过渠道，文本生成就只走启用的渠道；全部停用即视为模型未配置。没有任何渠道时，才沿用上面的 `TAVERN_MODEL_*` 单线路与 `TAVERN_MODEL_FALLBACKS`。

**支付回调契约**（`POST /api/payments/webhook`）：

```json
{ "orderId": 1, "amount": 100, "currency": "CNY", "status": "paid", "timestamp": 1790000000, "signature": "hmac-sha256-hex" }
```

签名原文：`orderId|amount|currency|status|timestamp`，密钥为后台 `payment.secret`；金额必须等于订单金额，时间戳误差不超过 10 分钟。结算页 token 使用派生密钥，不能用于回调。

**运维**

```bash
npm run check                       # 生产构建 + 启动 3101 + 生产探针（CI 同款）
node scripts/production-probe.mjs   # 只读生产探针
bash scripts/backup.sh              # SQLite 热备份 + 媒体打包，建议每日 cron
```

仓库已带 `.github/workflows/ci.yml`：构建 + 启动探针 + 依赖审计（审计暂不阻断）。

聊天生图/语音写入 `.data/media` 并登记为 private，只有本人登录后可读；角色封面/形象为 public。反向代理需关闭 SSE 缓冲（Nginx `proxy_buffering off;` 或 `X-Accel-Buffering: no`），并把 `/api/health` 作为存活探针。SQLite 是单实例部署，禁止多副本同时写同一个 `.data/tavern.db`。

**已补齐**：管理员 2FA、邮箱更换、聊天历史分页、私有媒体鉴权、帮助/申诉页、后台用户详情与角色管理、举报内容预览与下架/封禁处置、上游多线路渠道（优先级 failover + 从上游拉取模型 + 单条测试）、全站预算、毛利粗算、CI 探针。**仍未完成的上线阻断项**：真实支付网关与对账/发票、法律文案法务审核、依赖升级（2 high）。详见生产审计结论。

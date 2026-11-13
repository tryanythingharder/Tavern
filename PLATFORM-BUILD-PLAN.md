# 酒馆 CAI Portal — 平台建设作战计划

来源：zcode 会话 `sess_5d7bdc39-c227-4d5a-8aae-5d58ed8b6b53`（"启动设计原型"）中断后接手。
目标：把 `prototype/` 的设计意图完整落到 `SillyTavern/` 真实站点，并做到可上线。

## 现状判定（2026-11-04 三路只读审计）

- 后端成熟度 **62/100**：资金账本的幂等/验签/fail-closed 质量高，但计费只覆盖单一 provider、非资金 JSON 全 fail-open、结算无对账闭环、反代下限流失效、SSRF 常开。
- 前端：业务几乎全真（广场/点数/支付/角色/群聊都走接口），但 v2 设计系统 **0 落地**（`--g900`/`--r-md`/`p-cinema`/`disc-gallery` 在 `public/` 全量 0 命中）。
- 工程：根无 `test` 脚本，5 个 `.test.mjs` 进不了 CI，`playwright.cai.config.js` 只存在于文档里。

## 波次与文件所有权

### 第 1 波（本轮）
| 组 | 职责 | 独占文件 |
|---|---|---|
| 后端·数据层 | 广场 7 个 JSON 改 fail-closed + schema 校验 + 详情 GET 不再写盘 | `plugins/cai-portal/plaza.mjs`、`tests/cai-plaza-store.test.mjs` |
| 后端·资金 | 结算写审计 + 后台对账接口 + 启动扫描 `settling`/`pending` | `plugins/cai-portal/credits.mjs`、`plugins/cai-portal/index.mjs`、`public/admin/admin.js`、`tests/cai-settlement.test.mjs` |
| 前端·视觉基座 | v2 令牌别名层、聊天头部 720px 对齐、44px 触控、广场筛选吸顶 | `public/css/cai-shell.css`、`public/css/cai-chat.css` |
| 前端·交互 | 详情页入口收敛、修 `doNewChat` 无条件新建、stats 占位消抖 | `public/scripts/cai-app.js` |
| 工程·门禁 | `npm run test:cai`、CI 收 `.mjs`、补 `playwright.cai.config.js` | `package.json`、`.github/workflows/`、`tests/*.config.js` |

### 第 2 波（缺失模块，需新接口）
通知中心（含举报回执/作品更新站内信）、独立角色库页、创作页从 modal 升独立页 + 作品管理、点数流水/登录设备/数据导出/注销账号。

### 第 3 波（设计迁移）
影院模式开关机制 → `cinema.css` 令牌重写（2540 行）→ `vendor/three` + `disc-gallery.js` 逐页接入（广场→发现→详情→作者页）→ 转场。

### 第 4 波（上线）
真实易支付验签链路、反代 XFF 实测、备份恢复演练、测试数据清理与令牌轮换、`PRODUCTION-ACCEPTANCE` 18 行矩阵取证。

## 第 1 波交付记录（2026-11-04）

| 项 | 结果 | 证据 |
|---|---|---|
| 广场存储 fail-closed | `plaza.mjs` 新增 `loadStore/saveStore` + 6 个 validator；坏文件先备份 `.corrupt-<ts>` 再抛错；详情 GET 不再重写 `plaza.json` | `tests/cai-plaza-store.test.mjs` 8 用例全绿 |
| 结算对账闭环 | `settleOrder` 全链路写审计；新增 `admin-settlement` GET/retry/void 三接口（均 admin）；启动只读扫描 `scanSettlementAnomalies` | `tests/cai-settlement.test.mjs` 7 用例全绿 |
| 前端视觉基座 | v2 令牌别名层（13 阶中性/6 档圆角/间距/字阶/阴影）；聊天条改 720px 网格真居中；触控目标 44px；广场筛选吸顶 | 无头 Chrome 几何实测：1280/800/500 三档标题中心 == 消息列中心 |
| 详情页交互 | `doNewChat` 不再无条件新建；三入口收敛为「开始新故事 / 继续对话」；stats 骨架消抖；备用开场白折叠；返回广场修文案 | `cai-app-navigation` 55 用例全绿 |
| 测试门禁 | 根 `package.json` 新增 `test:cai`；CI 新增 `run-cai-tests` job | `npm run test:cai` → **132 pass / 0 fail** |
| 隔离实机验收 | fixture 独立 dataRoot/端口 + mock 上游启动通过 | 注册→登录→生成（100→99 点）→ 广场 200；玩家访问 `admin-settlement` 403 |

### 仍未解决（第 2 波起）
- 计费绕过：非 `custom` 源不计费（需限制非管理员可用的 provider）。
- 反代下限流退化为全站单桶（`preferRealIpHeader`）。
- 通知中心 / 角色库独立页 / 创作独立页 / 点数流水·设备·导出·注销：前端无入口、后端无接口。
- 影院模式 + 3D 光盘：`public/` 仍 0 接入。
- `playwright.cai.config.js` 与 CAI e2e 用例仍缺（fixture 的 tests 命令跑不通）。

## 第 2 波交付记录（2026-11-04）

| 项 | 结果 | 证据 |
|---|---|---|
| 计费绕过封堵 | `chat-completions.js` 新增 `enforcePlayerGateway()`：非管理员不论传什么来源，一律改写成 `custom` + 网关地址，并删除 `reverse_proxy`/`proxy_password`/`secret_id`；网关未配置回 503 不放行 | 实机：`pollinations` 来源 → 走网关并扣点 100→99；`openai`+`reverse_proxy:169.254.169.254` → 收敛到网关并扣点 |
| 中断计费 | `forwardStreamWithBilling` 抽出 `settleStreamCharge()`，`error` 分支按已收文本估算扣费，`WeakSet` 保证只扣一次 | 8 用例覆盖正常/中断/空文本/不二次扣 |
| SSRF 收敛 | 玩家不可再指定任意 `reverse_proxy`（随来源改写一并丢弃） | 同上实机验证 |
| 反代限流 | `getIpAddress()` 在直连对端是回环（本机反代）时采信 `X-Real-IP`/`X-Forwarded-For`；公网直连仍不可伪造 | 8 用例；两玩家同代理得到不同限流键 |
| 站内通知中心 | 新增 `notify.mjs`（原子写+校验+坏文件备份）、三条玩家接口、审核/举报/作品更新三处触发点；前端铃铛+`#/notifications` 页 | 7 用例；实机 `GET /notifications` 200、`read-all` 200 |

**累计测试**：`npm run test:cai` = **155 pass / 0 fail**（第 1 波 132 → 第 2 波 155）。

### 仍待第 3 波
- 角色库独立页（现在塞在设置左列，缺"已添加"维度与搜索）。
- 创作页从 modal 升独立页 + 作品管理（草稿/审核状态/撤回/私人试聊）。
- 点数流水 / 登录设备 / 数据导出 / 注销账号：前端无入口、后端无接口。
- 影院模式 + 3D 光盘：`public/` 仍 0 接入（令牌基座已在第 1 波铺好）。
- CAI e2e：`playwright.cai.config.js` 与用例仍缺。
- 支付：仅 mock 链路，真实易支付沙箱未验。
- 通知触发点只做了代码级接线，缺"管理员审核 → 作者收到通知"的浏览器端到端取证（管理端账号在 fixture 里密码随机，无法登录）。

## 硬约束（所有子代理必须遵守）

1. 不读、不写、不覆盖真实 `data/cai-portal/` 的资金与用户数据。
2. 不改 SillyTavern 原生消息 DOM（`#chat`/`.mes`/`#send_form`）与提示词存储格式。
3. 不 `git commit`、不推送。
4. 每个改动必须 `node --check` 通过；新增逻辑必须带可执行测试。
5. 不得把"函数存在/HTTP 200/测试绿"写成"生产就绪"。

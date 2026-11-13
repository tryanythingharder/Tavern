# 酒馆 · RP Platform

一个以 SillyTavern 能力为内核的多用户角色扮演（RP）平台：角色卡、世界书、预设、正则、快捷回复、多角色房间、点数计费、后台管理与上游模型渠道。

仓库包含两部分：

| 目录 | 说明 |
| --- | --- |
| `prototype/` | 静态设计原型（HTML/CSS/JS），是页面结构与视觉的参考基线 |
| `app/` | 真正的 Next.js 15 + React 19 + TypeScript 实现，SQLite 单实例部署 |

> `SillyTavern/` 是本地只读参考，不包含在本仓库中。

## 快速开始

```bash
cd app
npm install
cp .env.example .env.local   # 若仓库提供了示例；没有就手动创建
npm run dev                  # 开发模式，默认 http://localhost:3000
```

生产构建：

```bash
cd app
npm run build
npm start                    # 默认 3000；本机验收脚本使用 3100
```

### 必需的环境变量

```bash
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100
TAVERN_MODEL_BASE_URL=https://your-upstream/v1
TAVERN_MODEL_API_KEY=...
TAVERN_MODEL_NAME=...
TAVERN_ADMIN_EMAILS=you@example.com
```

也可以不写环境变量，登录后台后在「渠道」里新建 OpenAI 兼容渠道：填 Base URL 与 Key，点「获取模型」从上游 `/models` 拉取模型并选择默认模型即可。渠道支持多条、按优先级 failover。

完整的生产环境变量、支付回调契约、备份与探针说明见 [`app/README.md`](app/README.md)。

## 主要能力

- **角色与创作**：角色卡导入（SillyTavern V2/V3 JSON、PNG）、立绘/封面、备用开场、作品版本、审核与下架。
- **对话**：经典/影院双视图、流式生成、消息编辑/重生成/分支、书签、记忆与摘要、世界书、预设、正则、快捷回复。
- **多角色房间**：多角色同场、发言策略（自然/顺序/手动/随机）、成员静音、按 token 计费。
- **账号与资产**：邮箱注册/验证/找回/换绑、TOTP 两步验证、点数余额、签到、兑换码、充值订单、角色库与收藏。
- **后台**：玩家与角色审核、举报处置、订单/卡密/邀请码、公告、模型渠道、接口配置、审计日志、用户详情。
- **生产加固**：点数预扣/结算、事务化资金路径、支付签名与金额校验、登录限流、私有媒体鉴权、聊天分页、安全头、健康探针、备份脚本、CI。

## 目录速览

```text
app/
  app/            Next.js App Router 页面与 API
  components/     界面组件
  lib/            数据库、认证、点数、计费、模型渠道、媒体等
  styles/         原型 CSS 层 + app-overrides.css 覆盖层
  scripts/        探针、备份、管理员初始化、CI 检查
  public/         静态图片与字体
prototype/        静态原型（设计基线）
PLATFORM-BUILD-PLAN.md
```

## 安全提示

- 不要提交 `.env.local`、`.data/`、数据库文件或任何上游 API Key；仓库的 `.gitignore` 已默认排除。
- 如果 Key 曾经出现在聊天、截图或公开仓库中，请立即到上游控制台轮换。
- 生产部署前请阅读 [`app/README.md`](app/README.md) 的「生产部署最小清单」与「已知边界」。

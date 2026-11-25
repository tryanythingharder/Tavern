# 角色卡来源与许可

种子数据：`app/data/plaza-seeds.ts`（2026-11-24 新增 39 张）。最早的 6 张种子卡（沈砚之、林晚照、白露、陆时衍、阿蘅、谢无咎）不在本次范围内。

收录规则：外部卡只收**明确标注 CC0 或 CC BY** 的；找不到明确许可的一律不收。所有卡：不用现有 IP、不写真人、角色均为成年人、`nsfw = 0`。

## 原创（35 张，作者署名「酒馆编辑部」）

本项目自写，与仓库同许可。
恋爱：温知予、沈既白、许棠 · 奇幻：薇丝珀、洛恩、灰烬王庭 · 科幻：零柒、林殊 · 古风：柳青崖、云止 · 悬疑：周默、海雾旅馆、苏缄 · 恐怖：404 号夜班、阿槐 · 校园：陆知行、宁夏、程澈 · 都市：江屿、秦昭、何满 · 治愈：山茶、白禾 · 冒险：卡珊、阿岚、叶槿 · 历史：苏曼卿、艾琳·阿什、洛伦佐 · 游戏：掷骰人、阿汤、晴川镇 · 助手：墨白、莉娜、阿序

## 外部（4 张，CC BY 4.0，作者署名「Foreverse」）

来源仓库：Foreverse Team，`foreverse-app/character-card-skills` — https://github.com/foreverse-app/character-card-skills
许可：仓库 `LICENSE-CONTENT` 声明 `cards/` 下的角色卡以 **CC BY 4.0** 发布（https://github.com/foreverse-app/character-card-skills/blob/main/LICENSE-CONTENT ，许可原文 https://creativecommons.org/licenses/by/4.0/ ）。兔娘站转载页同样标注“CC BY 4.0 · Foreverse Team”（https://tuniang.app/cards/ ）。卡数据取自该转载页的 JSON（与仓库同一批卡）。

| 本站 id | 本站名称 | 原卡 | 原路径 | 大类 |
|---|---|---|---|---|
| `tang-tuantuan` | 唐团团 | 唐团团 | cards/zh/tangtuantuan | 治愈 |
| `pei-yu` | 裴聿 | 裴聿 | cards/zh/peiyu | 古风 |
| `redline-salvage` | 红线打捞社 | Redline Salvage Co. | cards/en/redline-salvage | 科幻 |
| `grey-hollow-light` | 灰谷灯塔 | The Lighthouse at Grey Hollow | cards/en/the-lighthouse | 恐怖 |

**改动说明**（CC BY 要求注明）：按本站种子卡格式压缩改写了一句话简介、开场白、角色描述和节奏；两张英文卡另写了中文版；删去了原卡的 HTML 状态面板、`$` 指令、世界书、示例对话和隐藏线。署名与许可链接同时写进了每张卡的「创作者备注」（`card_fields.creatorNotes`）。改编不代表原作者认可。

未收录：同一来源中的「江迟野」（高中生设定，不满足“均为成年人”）、「聂小倩」（聊斋既有角色，属于现有 IP），以及其余未选用的卡。其他检索到的卡库要么没有许可声明，要么是 CC BY-NC / BY-NC-SA / BY-NC-ND（非 CC0/CC BY），均未收录。

## 立绘（39 张广场补充卡，AI 生成）

`app/public/characters/{id}.jpg` 中上述 39 张卡（35 张原创 + 4 张 Foreverse 改编）的立绘均为 **AI 生成**：通过 RelayCat 图像接口（OpenAI 兼容）调用模型 `gpt-image-2` 生成（2026-11-24），再缩放裁切为 933×1400 JPEG。

- 画风按每张卡自身的题材决定（如古风用工笔/水墨、赛博朋克用霓虹数字绘画、校园用日系插画、都市用写实摄影感、奇幻用奇幻插画等），不追求与最早 6 张立绘统一。
- 提示词全部为本站根据卡面设定自写：角色一律为成年人；**非真人、不仿照任何真人或名人、不使用任何现有 IP 角色**；无裸露、无性暗示、无血腥；画面不含文字、水印、logo。
- 4 张 Foreverse 改编卡的立绘不来自原卡，原卡如有配图均未使用；立绘不属于 CC BY 改编内容的一部分。
- 最早 6 张种子卡的立绘不在本节范围内。

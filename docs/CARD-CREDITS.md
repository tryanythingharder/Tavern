# 角色卡来源与许可

种子数据：`app/data/plaza-seeds.ts`（2026-11-24 新增 39 张）与 `app/data/plaza-seeds-licensed.ts`（2026-11-25 第二批 41 张，见文末「第二批」）。最早的 6 张种子卡（沈砚之、林晚照、白露、陆时衍、阿蘅、谢无咎）不在本次范围内。

收录规则（第一批）：外部卡只收**明确标注 CC0 或 CC BY** 的；找不到明确许可的一律不收。所有卡：不用现有 IP、不写真人、角色均为成年人、`nsfw = 0`。

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

---

## 第二批：外部授权卡（41 张，2026-11-25，均已翻译改编）

数据：`app/data/plaza-seeds-licensed.ts`，合并进 `PLAZA_SEEDS`。逐张来源清单另见 `work/audit-probe/licensed-cards/sources.md`（不入库）。

收录规则（第二批）：只收 **CC0 1.0、CC BY 4.0、CC BY-SA 4.0**，或作者明文允许商用的卡；NC、ND、无许可、许可不明一律不收。排除同人卡与真人卡（基于现有动漫 / 游戏 / 小说 / 影视角色或真人的都不收）；角色一律成年，不收露骨、NSFW 的卡，不收美化未成年或含性暴力的卡。所有卡 `nsfw = 0`。

许可原文：CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ · CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/ · CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/

许可声明位置：
- Foreverse Team（foreverse.app）：仓库 `foreverse-app/character-card-skills` 的 `LICENSE-CONTENT` 声明 `cards/` 以 CC BY 4.0 发布（https://github.com/foreverse-app/character-card-skills/blob/main/LICENSE-CONTENT ）。
- RisuRealm（https://realm.risuai.net ）：每张卡页面数据里带 `license` 字段，下表的许可即取自该字段（2026-11-25 抓取）；平台许可说明页 https://realm.risuai.net/help/license 。
- Aria Maiven《Nora Ferraz》：仓库 `inhabitants/character-kits` 的 `LICENSE` 为 CC BY 4.0（https://github.com/inhabitants/character-kits/blob/main/LICENSE ）。
- Garret E. Williams 的三个人设模板：仓库 `garretewilliams/utility-persona-templates` 的 `LICENSE` 为 CC BY 4.0（https://github.com/garretewilliams/utility-persona-templates/blob/main/LICENSE ）。

| 本站 id | 本站名称 | 原卡 | 原作者 | 来源 | 许可 | 大类 |
|---|---|---|---|---|---|---|
| `huo-yushen` | 霍聿深 | 霍聿深 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/huoyushen | CC BY 4.0 | 恋爱 |
| `shen-yan-collector` | 沈砚 | 沈砚 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/shenyan | CC BY 4.0 | 恋爱 |
| `caleb-moore` | 凯勒·摩尔 | Caleb Moore | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/en/caleb | CC BY 4.0 | 恋爱 |
| `rosalind-vane` | 罗莎琳德·维恩 | Rosalind Vane | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/en/rosalind | CC BY 4.0 | 恋爱 |
| `nai-fuer` | 奈芙尔 | 奈芙尔 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/naifuer | CC BY 4.0 | 奇幻 |
| `vaelin-ardent` | 维林·阿登特 | Vaelin | ieungieung | https://realm.risuai.net/character/139cc6c0-13b0-4ede-b42b-eaa22bca11c4 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 奇幻 |
| `sinmarked` | 罪印者 | Sinmarked | ieungieung | https://realm.risuai.net/character/387a703e-8122-4d7a-8e34-069ebb26d0bc | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 奇幻 |
| `silvestra` | 希尔维斯特拉 | Silvestra | ieungieung | https://realm.risuai.net/character/9bd1732f-8bf5-40e0-ae8c-3fa106f9e6bb | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 奇幻 |
| `tinnueth` | 汀努艾丝 | Tinnueth | yaethi | https://realm.risuai.net/character/52edf6a9-a05a-469b-962e-6e35656a86a6 | CC0 1.0 | 奇幻 |
| `nibur` | 妮布尔 | Nibur | yaethi | https://realm.risuai.net/character/3114c498-637a-4e9e-8c77-64f455075efc | CC0 1.0 | 奇幻 |
| `demonomics` | 恶魔经济学 | Demon'omics | sjs1830 | https://realm.risuai.net/character/20a710cb-18a3-40e8-81a9-c0ae51d861f0 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 奇幻 |
| `static-crew` | 静电（STATIC） | STATIC | ieungieung | https://realm.risuai.net/character/011e749a-8662-4068-8c2b-b1565d8b2b2c | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 科幻 |
| `shannon-mechanism` | 香农机制 | Shannon Mechanism | sjs1830 | https://realm.risuai.net/character/db8e3f10-adac-4f49-9a12-f2fd632631ed | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 科幻 |
| `answering-machine` | 自动应答机、作家、神 | 자동응답기, 작가, 신. | sjs1830 | https://realm.risuai.net/character/8e50a4fe-0ff6-48ee-a7bd-09de3fbe455e | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 科幻 |
| `xuan-jing` | 玄净 | 玄净 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/xuanjing | CC BY 4.0 | 古风 |
| `dead-spring-island` | 买死春 | 매사춘 (買死春) | sjs1830 | https://realm.risuai.net/character/f54093d7-dc80-4b9d-b62c-db4bd5f0e2d0 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 悬疑 |
| `mirror-of-obsession` | 执妄之镜 | 망집의 거울 | sjs1830 | https://realm.risuai.net/character/cd7ba75f-a6cc-4dea-85ff-f3247d0248fb | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 悬疑 |
| `great-rainfall` | 大豪雨 | 대호우 | sjs1830 | https://realm.risuai.net/character/a30a5a46-cbde-4fdd-9f7a-94de936996b3 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 悬疑 |
| `amber-castle` | 琥珀城的女主人 | Anastasia Gerda (아나스타시아 게르다) | sjs1830 | https://realm.risuai.net/character/f3aa9f91-f65d-4179-9e45-33a7bd81a763 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 恐怖 |
| `jangsan-beom` | 长山虎 | 장산범 | sjs1830 | https://realm.risuai.net/character/1d096ed2-e38e-4b34-8b99-aaac50346075 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 恐怖 |
| `kabeko` | 卡贝子 | Kabeko | yaethi | https://realm.risuai.net/character/dbb936c0-f38e-4199-9d37-f479171d6908 | CC0 1.0 | 恐怖 |
| `song-zhixia` | 宋知夏 | 宋知夏 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/songzhixia | CC BY 4.0 | 校园 |
| `su-nianzhi` | 苏念栀 | 苏念栀 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/sunianzhi | CC BY 4.0 | 校园 |
| `nora-ferraz` | 诺拉·费拉斯 | Nora Ferraz | Aria Maiven（inhabitants / Sapiens Sintéticos） | https://github.com/inhabitants/character-kits/tree/main/characters/nora-ferraz | CC BY 4.0 | 都市 |
| `paradise-lost-kiss` | 失乐园之吻 | 失樂園의 키—스 | sjs1830 | https://realm.risuai.net/character/6c6caf21-9b0e-4fa2-a5c0-71c5c72c1695 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 都市 |
| `iris-london` | 艾瑞斯 | Iris (아이리스) | sjs1830 | https://realm.risuai.net/character/9c1c7620-0063-44c1-9354-3b6b55307df8 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 都市 |
| `frankie-doyle` | 弗兰琪·多伊尔 | Frankie Doyle | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/en/frankie-doyle | CC BY 4.0 | 治愈 |
| `darkroom-of-experience` | 经验冲印店 | 경험 현상소 | sjs1830 | https://realm.risuai.net/character/32ed0569-8e4d-4f69-a045-dea835a19408 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 治愈 |
| `serpent-library` | 蛇之图书馆 | 뱀의 도서관, 도서관의 뱀 | sjs1830 | https://realm.risuai.net/character/9a412d26-6a2e-4495-8c2c-cb4cd3ca33d1 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 治愈 |
| `mother-christmas` | 圣诞妈妈 | Mother Christmas | flomealexander | https://realm.risuai.net/character/db88d5b0-1bef-44be-81ee-3f166a012b83 | CC BY 4.0 | 治愈 |
| `edmund-harrower` | 埃德蒙·哈罗尔 | Edmund Harrower | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/en/edmund-harrower | CC BY 4.0 | 冒险 |
| `tower-in-the-rain` | 雨中之塔 | The Tower in the Rain (빗속의 탑) | sjs1830 | https://realm.risuai.net/character/e25e360d-3f0e-4bf5-95fe-c5b9b1c91e4f | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 冒险 |
| `court-of-opus` | 奥普斯宫廷的异乡人 | Stranger, In the Court of Opus | sjs1830 | https://realm.risuai.net/character/021ccc94-705d-4acb-927f-b1425073b88d | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 冒险 |
| `helka` | 赫尔卡 | Helka | yaethi | https://realm.risuai.net/character/9058ffb9-d2af-4705-9cd6-8082c6439176 | CC BY 4.0 | 冒险 |
| `vyx` | 维克丝 | Vyx | yaethi | https://realm.risuai.net/character/416f516c-8407-4638-815e-62cb2a1d05c6 | CC0 1.0 | 冒险 |
| `masquerade-of-cain` | 该隐假面舞会 | Masquerade of Cain - V3.7 | sjs1830 | https://realm.risuai.net/character/5ab26b7a-e9ec-41e2-b2a1-630bf9a1f699 | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 历史 |
| `wangu-night-market` | 晚孤市 | 晚孤市 | Foreverse Team | https://github.com/foreverse-app/character-card-skills/tree/main/cards/zh/wangushi | CC BY 4.0 | 游戏 |
| `digital-drama` | 华丽壮观数码大剧 | The Magnificent and Spectacular Digital Drama | ieungieung | https://realm.risuai.net/character/2a77389e-b7f1-4fb4-9b67-6dcd294516ee | CC BY-SA 4.0（改编版同样以 CC BY-SA 4.0 发布） | 游戏 |
| `madame-ossory` | 奥索里夫人 | Madame Ossory (tarot-classic) | Garret E. Williams | https://github.com/garretewilliams/utility-persona-templates/blob/main/templates/character-card-v2/tarot-classic.v2.json | CC BY 4.0 | 助手 |
| `chef-scorch` | 焦火主厨 | Chef Scorch (roast-playful) | Garret E. Williams | https://github.com/garretewilliams/utility-persona-templates/blob/main/templates/character-card-v2/roast-playful.v2.json | CC BY 4.0 | 助手 |
| `auntie-marigold` | 金盏阿姨 | Auntie Marigold (fortune-gentle) | Garret E. Williams | https://github.com/garretewilliams/utility-persona-templates/blob/main/templates/character-card-v2/fortune-gentle.v2.json | CC BY 4.0 | 助手 |

分布：来源 Foreverse 11 / RisuRealm 26 / GitHub 4；许可 CC BY 4.0 17 / CC BY-SA 4.0 20 / CC0 1.0 4。

**改动说明（已翻译改编）**：41 张卡全部经过本站翻译改编——英文、韩文原卡译为中文并重写，中文原卡压缩改写；同时为每张卡写了英文卡面。按本站种子卡格式重写了一句话简介、开场白、角色描述和节奏；删去了原卡的 HTML 状态面板、指令、界面脚本、世界书和示例对话。个别卡另有改动，已写在该卡的「创作者备注」里：
- 《玄净》：明确写出主角拜师时已满二十岁。
- 《自动应答机、作家、神》：笔友名字改为「旅人」（原名借自已有文学作品）。
- 《雨中之塔》：开场里递许愿条的角色改为卖红薯的老奶奶。
- 《蛇之图书馆》：开场城市改用泛称「港城」。
- 《维克丝》：收敛了原卡中的粗口。
- 《圣诞妈妈》《金盏阿姨》：补写了开场白的部分场景描写。
- 《奥索里夫人》《焦火主厨》《金盏阿姨》：保留原模板的娱乐定位与安全规则（不作真实预言；不给医疗、法律、财务建议；吐槽前先征求同意，安全词即停）。

每张卡的「创作者备注」（`card_fields.creatorNotes`）中都写了原作者、来源 URL、许可名称与链接、「已翻译改编」声明，以及「改动由本站负责，不代表原作者」。改编不代表原作者认可。

**CC BY-SA 4.0 卡（20 张）**：维林·阿登特、罪印者、希尔维斯特拉、静电（STATIC）、华丽壮观数码大剧（作者 ieungieung）；恶魔经济学、香农机制、自动应答机作家神、买死春、执妄之镜、大豪雨、琥珀城的女主人、长山虎、失乐园之吻、艾瑞斯、经验冲印店、蛇之图书馆、雨中之塔、奥普斯宫廷的异乡人、该隐假面舞会（作者 sjs1830）。按 BY-SA「相同方式共享」条款，**这 20 张卡的本站改编版本（中英文卡面文字）同样以 CC BY-SA 4.0 发布**，复用时请保留原作者署名、来源链接与本站的改动说明。

**CC0 1.0 卡（4 张，作者 yaethi）**：汀努艾丝、妮布尔、卡贝子、维克丝。CC0 不要求署名，本站仍逐张署名致谢。

### 第二批未收录（候选审读后排除）

- **同人 / 现有 IP**：RisuRealm 上许可合格、但基于现有作品角色的卡，如 Yae Miko、Suguru Geto（6 个版本）、Jiyan、Elaina、Meloetta、Hogwarts 系列、Gurren Lagann、Transformers、Hashirama、SCP 系列、Fallout 背景的 Nadia、“Yee” 恐龙 Oro 等；Foreverse 的「聂小倩」（第一批已排除）。
- **真人或影射真人**：Sir Gyllenhaal（用真人演员名）、阴阳大正 100 年（以真实历史人物为情节核心）、Firebird Ouroboros（三位主角疑似影射真实创作者）。
- **未成年或学生设定**：Hanako / Taro（15 岁）、Hikori（16 岁）、Lee Gaeun（12 岁）、Caleb（deadman，高中生）、Yeonseo（高中生）、Hwan Si-Eun（高中生）、Xanadu Academy（学生 14 岁起）、DSH-RolePlay《许弥·课间墙》（高三学生）、Foreverse「江迟野」（第一批已排除）；外观或设定偏未成年感的 Devil-chan、Miria、Momo-chan、Pikaru、Piko 也未收。
- **露骨 / 性内容**：Evelina、Yuna、AD-001fmd、Kidel Esteban、Kol Zennor、Nadia（kjw95946）、Saionji Tsubaki、Mezana、Nyavka、Sefi、Sahti、Lexica 等。
- **性暴力、虐待或强制关系为核心**：AIRWING（军中性侵设定贯穿世界观）、Labyrinthos Welfare Center、Grave of Cherry Blossom、Galleria de Giganti、Kotoha（病娇妹妹）、Ion（家暴）、Foreverse「纪闻笙」（病娇、强制爱边缘）。
- **借用已有文学作品的核心设定**：Dados de Godot（博尔赫斯《巴比伦彩票》的「公司」与「圣厕」）、GigantoReplica（城市 Ukbar）。
- **重复版本、同质或质量不足**：Silvester（Silvestra 的男性版）、Silvestra / Shangri-la 的旧版本、Camelot、Mankind Protocol（有少年 NPC）、The Trio Next Door（主要角色含儿童）、Yuha（开场是被囚禁的哥布林女孩）、Rukia / Amalla / Yaka / Vlada（设定过简）、utility-persona-templates 其余 6 个同质模板、DSH-RolePlay 中由 Foreverse 卡改作的 3 张（与原卡重复）。
- **许可不合格**：chub.ai 系列（含 HF 上的 raincandy-u/chub-ai-cards 数据集）本身无许可，卡内声明多为 CC BY-NC-SA；其余检索到的仓库多为 NC、GPL 或无许可。

### 第二批立绘（41 张，AI 生成）

`app/public/characters/{id}.jpg` 中上表 41 张卡的立绘均为 **AI 生成**：通过 RelayCat 图像接口（OpenAI 兼容）调用模型 `gpt-image-2` 生成（2026-11-25，1024×1536），再缩放裁切为 933×1400 JPEG（单张 ≤ 250 KB）。

- 画风按每张卡的设定决定（日系插画、写实油画感、暗黑奇幻、场景插画、童话绘本等）。
- 提示词全部为本站根据卡面设定自写，未使用、未参考原卡的任何配图：角色一律为成年人；**非真人、不仿照任何真人或名人、不使用任何现有 IP 角色**；无裸露、无性暗示、无血腥；画面不含文字、水印、logo。
- 立绘不属于上述 CC BY / CC BY-SA / CC0 改编内容的一部分。

## 第三批：18+ 成人向授权卡（11 张，2026-11）

数据在 `app/data/plaza-seeds-r18.ts`（文件末尾合并进 `PLAZA_SEEDS`），每张 `nsfw: true`，只对通过平台分级（`lib/age-gate.ts`：全站开关、地区、登录、出生日期、年龄线、强验证地区）的用户出现；新账号默认隐藏 18+。
立绘不放 `public/`，在 `app/private/characters/{id}.jpg`，由 `app/characters/[file]/route.ts` 按 `nsfwBlock` 判定后提供（地址仍是 `/characters/{id}.jpg`）。

全部来自 RisuRealm，许可取自每张卡页面数据中的 `license` 字段（爬取 2026-11-25；许可说明页 https://realm.risuai.net/help/license ）。每张卡都已**翻译改编**：译为中文并压缩改写简介、开场白和设定，删去原卡状态栏、图片标签、脚本与世界书；卡面不写露骨描写，统一加了「成年、自愿、说停就停」的边界说明；改动由本站负责，不代表原作者，改编不代表原作者认可。卡内 `creatorNotes` 与结构化 `source` 字段写明了作者、原卡地址、许可与链接。

| id | 中文名 | 原名 | 作者 | 来源 | 许可 | 本站额外改动 |
|---|---|---|---|---|---|---|
| `jago-malhotra` | 贾戈·马尔霍特拉 | Jago "Redline" Malhotra | ieungieung | https://realm.risuai.net/character/09e6b8c4-8b31-4b13-a788-77c96ea56716 | CC BY-SA 4.0 | 略去露骨性偏好清单 |
| `mihkel-rebane` | 米赫克尔·雷巴内 | Mihkel | ieungieung | https://realm.risuai.net/character/8f8d108e-5efa-4978-8b4f-ee0f968a3042 | CC BY-SA 4.0 | 略去露骨亲密细节 |
| `yuna-lee` | 李侑娜 | Yuna | kogg333 | https://realm.risuai.net/character/75e9b1baf315b3b13cbf1f3de28cad2b2f4c366a967097afe44ba9312e9ae04c | CC BY 4.0 | 略去露骨身体与性经验描写 |
| `hayeon` | 夏妍 | Hayeon (@heyhayeon) | maczxc | https://realm.risuai.net/character/5765254c-b7fe-45f2-a71d-75dcc9888679 | CC BY 4.0 | — |
| `kol-zennor` | 科尔·岑诺 | Kol Zennor | dudosha | https://realm.risuai.net/character/7c6ae291-daae-4766-b584-8a7835316d73 | CC BY 4.0 | 删去原性偏好清单中涉及侵犯的条目，关系改为双方自愿；补写开场白后半段 |
| `park-nieun` | 朴尼恩 | Nieun | kyw7777 | https://realm.risuai.net/character/d7141514-bce1-45cc-a52e-e225826da2a8 | CC BY 4.0 | 世界书中的其他角色（含原世界观里 17 岁的少年版角色）一律未收 |
| `cigenia` | 奇格尼娅 | Cigenia | kyw7777 | https://realm.risuai.net/character/1851fb88-2c8a-4203-93c7-f3cf77011238 | CC BY 4.0 | 妹妹遇害经过只保留概述 |
| `tinyaan` | 缇娅安 | Tinyaan | kyw7777 | https://realm.risuai.net/character/9c653d11-b89e-496f-8d04-f95964428db8 | CC BY 4.0 | — |
| `maryhub` | 玛丽哈布 | Maryhub | kyw73061 | https://realm.risuai.net/character/b7fb932a-4253-4e00-9390-1a4c806850d5 | CC BY 4.0 | 补写开场白结尾 |
| `lee-dohyun` | 李道贤 | 이도현 | hcse88 | https://realm.risuai.net/character/b87a9024-afa6-4ee2-af7a-efce337b01a0 | CC BY 4.0 | 只保留主角，其他同学与家人设定略去 |
| `jacob-gyllenwald` | 雅各布·吉伦瓦尔德爵士 | Sir Gyllenhaal | tisayai | https://realm.risuai.net/character/28fae487-682f-4680-9d50-69144ba1c385 | CC BY 4.0 | 原角色名与一位真人演员同名：角色与家族改名为「吉伦瓦尔德」，父母名等配角信息略去（第二批曾因同名排除，本批改名后收录） |

许可原文：CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ ；CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/ 。
**CC BY-SA 4.0 卡（2 张，作者 ieungieung）**：贾戈·马尔霍特拉、米赫克尔·雷巴内——本站改编版本同样以 CC BY-SA 4.0 发布。其余 9 张为 CC BY 4.0。

### 第三批立绘（11 张）

- **复用原卡自带图（6 张）**：`jago-malhotra`、`mihkel-rebane`、`kol-zennor`、`park-nieun`、`tinyaan`、`maryhub`。图片为原卡（charx / PNG 卡）内置的角色图，随卡以上表许可发布；本站只做了裁切缩放（933×1400 JPEG，≤250 KB），逐张目检：人物明显成年、无裸露、无性行为。复用的图同样适用原卡许可与署名。
- **AI 生成（5 张）**：`hayeon`、`jacob-gyllenwald`、`cigenia`、`lee-dohyun`、`yuna-lee`。原卡图不适合（多视图设定稿、带原名与作者水印文字、构图过于暴露或外观偏幼）时，通过 RelayCat 接口调用 `gpt-image-2` 生成（2026-11-25，1024×1536），再裁切为 933×1400 JPEG（≤250 KB）。提示词按每张卡的外貌、设定、时代自写：人物一律明显成年、衣着完整，可以性感但无裸露、无性行为；非真人、不仿照任何真人或现有 IP；无文字水印。生成图不属于上述 CC 改编内容的一部分。

### 第三批未收录（候选审读后排除）

候选池：RisuRealm 全站按下载量翻完（约 7,800 张）后，许可为 CC0 / CC BY / CC BY-SA 的只有 106 张，再加上前两批审读时因露骨被排除的卡。逐张读了设定、开场白与世界书后排除：

- **以非自愿、强制或胁迫为核心**：Evelina Nightshade（系统指令要求写非自愿场景，催眠凝视）、Kidel Esteban（以「把对方变成性奴」为目标，另原卡无许可）、Sefi（被迫卖淫、「习惯被使用」）、Xi / Penelope（「圣绳」持有者说什么就做什么，角色不理解同意）、Erin Ellis（勒索支配、「逐步堕落」为剧情弧）、Rizu（声明接受强奸扮演、乱伦扮演等一切要求）、Ashebelle（跟踪监视、因对方另娶而亲手杀死对方来重置循环，属美化虐待）、규하율（以偷装监听手表跟踪为卖点）。
- **未成年或外观 / 设定偏未成年**：유키（外观 9 岁）、Temerosa√2（主要角色含 17 岁）、CLEA-01（「4 岁」机器人、150 cm）、Pennie（「娃娃脸」+ 露骨）、Caleb（高中生）、Yeonseo（高中生）、Tasha（18 岁高中生）、Hikori、AD-001fmd、Iris and the Time-Manipulators（大量少年少女角色）、네토리야 고등학교、프로위스 아카데미、하츠보시 학원、어린이、Caris（以儿童为对象的掠食者）。
- **乱伦**：The Vance Estate（家族乱伦后宫）。
- **同人 / 现有 IP**：Imoen（博德之门）、메로엣타（宝可梦）、마녀의 여행、거미입니다만、Valkyrie Sisters（Fate）、Lara（冒险岛）、전생왕녀、Debi & Marlene、타치바나 스이세이、배트 레이디（蝙蝠侠）、Hogwarts: EXTRA、Spongebob、Combaticon（变形金刚）、카사네 테토、Himekawa Chizuru（卡内另写 CC BY-NC-SA，许可矛盾）。
- **低质或物化**：텐가 / 미아 / 시노아（「飞机杯」设定）、에나（「性奴」）、테레사（「名义上的奴隶」女仆）、Carla（「活体臀部」）、자지 숭배 세계、Cecilia Bugobugo（「堕落」哥布林）。
- **非成人向或年龄不明**：Sahti（全年龄内容、年龄未写）、Rukia（全年龄陪伴型机器人）。
- **重复版本**：Nieun 的韩文旧版（11542c6f）。
- **许可不合格**：hornysilicon/silly-cards（无许可文件）、chub 系列（无许可，不收）、其余检索到的成人卡仓库多为 NC / ND 或无许可。

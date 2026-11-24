# 广场分类：调研与方案

更新：2026-11-24。代码里唯一的定义在 `app/lib/catalog.ts`（`CATEGORIES`、`SUGGESTED_TAGS`、`LEGACY_CATEGORY_MAP`、`classifyCategory`）。

## 1. 市面做法（调研摘录）

| 平台 | 实际用到的分类 / 标签 | 来源 |
|---|---|---|
| Character.AI | 首页分类条：Helpers、Anime Game Characters、Games、Anime、Game Characters、Comedy、Books、VTuber、Image Generating、Discussion、Language Learning、Religion、History、Animals、Philosophy、Politics。创作者文档：每张卡最多 3 个 Categories，约 50 个可选；新版改成“数百个”Tags，用于搜索筛选和首页发现（例：Romance / Slice-of-Life、Supernatural / RPG）。 | https://character.ai/ （首页分类条，经搜索快照）· https://book.character.ai/character-guide/character-attributes/categories · https://support.character.ai/hc/en-us/articles/50608939675035-3-Profile-and-Presentation-%E1%B4%97 |
| JanitorAI | 官方 50 余个标签，混合了**受众/视角**（Male、Female、MalePOV、FemalePOV、AnyPOV、MLM、WLW）、**题材**（Horror、Sci-Fi、Historical、RPG、Comedy、Fluff、Angst）、**角色类型**（Villain、Hero、Royalty、Monster、Elf、Vampire、Robot、Non-Human、Detective、Assistant）、**来源**（OC、Game、Anime、Books）和**形态**（Multiple、Scenario），另有 Limited/Limitless 作为内容分级。每卡最多 10 个，可加自定义标签。 | https://help.janitorai.com/en/article/faq-tags-1bo153l/ · https://help.janitorai.com/en/article/the-basics-the-character-creation-page-overview-15xevon/ |
| Chub | 标签完全由用户生成（例：Female、Fantasy、OC、Comedy、RPG、Scenario），少于 3 个标签的卡在搜索中隐藏；SFW/NSFW 单独评级。 | https://docs.chub.ai/docs/the-basics/character-creation · https://chub.ai/tags/Fantasy |
| 猫箱（字节） | 题材覆盖“仙侠、西幻、末世、悬疑侦探”，人设含总裁、竹马、明星、古风仙君、吸血鬼；应用商店介绍列“古风、都市、悬疑、同人、治愈”；首次登录要选至少 4 个兴趣标签；卡片上有“傲娇、病娇”等性格标签。 | https://www.163.com/dy/article/L2KM9S9L052682V2.html · https://www.gameggg.com/app/7141.html · https://5g.ai7.com/apps/n967905.html |
| 星野（MiniMax） | 智能体分三类：社交类（虚拟恋人/朋友）、游戏类（旁白+选项，如都市怪谈、海龟汤）、套壳类（绘画、助眠等工具）；发现页可按“二次元、古风、科幻”等标签搜索。 | https://zhuanlan.zhihu.com/p/1943811765273080715 · https://www.a8app.com/app/4018392.html |
| 筑梦岛（阅文） | 发现页 9 条线：互动剧情、原创人物、游戏人物、动漫人物、小说人物、影视综艺、历史人物、游戏挑战、AI 工具；Home 页 12 种互动对象标签：病娇、腹黑、豪门、高冷、毒舌、傲娇、校园等；商店介绍列“古风、奇幻、悬疑、科幻、轻喜剧”。 | https://www.huxiu.com/article/3902271.html · https://www.jiemian.com/article/11011174.html · https://sj.qq.com/appdetail/com.yuewen.dreamer |

规律：
1. 各家都把**题材/世界观**（古风、奇幻、科幻、悬疑、都市…）和**人设/关系/受众**（病娇、傲娇、男性向、BL…）分开。前者适合做单选大类，后者适合做多选标签。
2. **工具型**（助手、写作、学外语）和**玩法型**（跑团、海龟汤、模拟器）在 C.AI、星野、筑梦岛都单列，和陪聊角色分开。
3. **来源**（原创 / 同人 / 游戏角色 / 动漫角色）是另一个维度，和题材正交：同人卡可以是古风也可以是科幻。

## 2. 方案

### 大类（单选，13 个）

| 大类 | 英文 | 覆盖 | 主要依据 |
|---|---|---|---|
| 恋爱 | Romance | 以感情线为主：纯爱、先婚后爱、久别重逢 | C.AI Romance tag；猫箱/筑梦岛的主力题材 |
| 奇幻 | Fantasy | 西幻、架空魔法、人外 | 猫箱“西幻”；JanitorAI Magical/Elf/Monster |
| 科幻 | Sci-fi | 太空、赛博朋克、AI、末日 | JanitorAI Sci-Fi；星野、筑梦岛“科幻”；猫箱“末世” |
| 古风 | Ancient China | 中式古代：武侠、仙侠、宫廷 | 猫箱/星野/筑梦岛都把古风单列；猫箱“仙侠” |
| 悬疑 | Mystery | 推理、刑侦、解谜 | 猫箱“悬疑侦探”；JanitorAI Detective |
| 恐怖 | Horror | 规则怪谈、民俗、哥特 | JanitorAI Horror；星野“都市怪谈” |
| 校园 | Campus | 大学、研究生、社团（角色一律成年） | 筑梦岛 Home 标签“校园” |
| 都市 | Urban | 现代都市、职场、市井 | 猫箱“都市” |
| 治愈 | Comfort | 日常、陪伴、慢生活 | 猫箱“治愈”；JanitorAI Fluff |
| 冒险 | Adventure | 探险、寻宝、求生 | C.AI RPG/冒险类；JanitorAI RPG |
| 历史 | Historical | 写实历史时期：民国、维多利亚、文艺复兴 | C.AI History；JanitorAI Historical；筑梦岛“历史人物” |
| 游戏 | Gaming | 跑团、文字冒险、海龟汤、模拟经营 | C.AI Games；星野“游戏类”；筑梦岛“游戏挑战” |
| 助手 | Assistant | 写作、学习、效率等工具角色 | C.AI Helpers/Language Learning；星野“套壳类”；筑梦岛“AI 工具”；JanitorAI Assistant |

取舍：
- **同人/二创不设大类**，放进标签。理由见规律 3；另外本站种子卡不能用现有 IP，设成大类会长期空着。
- **古风和历史分开**：古风指中式古代审美（多为架空朝代、可含仙侠），历史指写实的具体时期（民国、维多利亚等）。
- “现代”并入“都市”；名称沿用猫箱的“都市”。

### 细分标签（多选）

建议标签（创建表单可一键添加，`SUGGESTED_TAGS`）：
男性向、女性向、全性向、纯爱、BL、GL、慢热、病娇、傲娇、毒舌、温柔、年上、年下、双强、欢喜冤家、先婚后爱、久别重逢、穿越、重生、末日、修仙、武侠、职场、豪门、陪伴、多角色、跑团、人外。

- 受众三分（男性向/女性向/全性向）对应 JanitorAI 的 MalePOV/FemalePOV/AnyPOV。
- 性格词（病娇、傲娇、毒舌、温柔）来自猫箱和筑梦岛的卡面标签。
- 形态词（多角色、跑团）对应 JanitorAI 的 Multiple/Scenario/RPG。

广场和搜索页的标签行**不是写死的**：从当前可见卡片的 `tags` 统计，按出现次数取前 12 个（与大类同名的标签不计），多选时取交集。

## 3. 迁移与导入

- 旧四类 → 新大类：现代→都市，奇幻/悬疑/治愈不变（`LEGACY_CATEGORY_MAP`）。迁移在 `lib/db.ts` 启动时执行，只改“不在新表里”的值，可重复执行。
- 原有种子卡中，没被后台改过题材的按新题材归位：林晚照→恋爱、白露→古风、陆时衍→都市、谢无咎→古风（只在当前值仍是旧种子值时才改）。
- 导入 ST 卡：`classifyCategory` 按标签（权重 5，与大类同名 8）、名字和简介（2）、描述（1，最多计 3 次）里的中英文关键词打分，同分时更具体的大类优先；总分不到 3 用默认值“都市”。在本次新增的 39 张卡上自测：中文卡面 37/39、英文卡面 37/39 归到作者指定的大类（错的两张是“古风刑侦”“赛博冒险”这类跨界卡）。这只是自洽性检查，不是对真实导入数据的评估。

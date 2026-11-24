// 纯常量与纯函数：客户端组件也要用，不能依赖 node:sqlite。
// 分类只在这里定义一份；调研依据见仓库 docs/categories.md。

/** 大类（题材）：每张卡恰好一个。中文就是存库的键，英文由 lib/i18n/en.json 翻译。 */
export const CATEGORIES = [
  '恋爱', // 以感情线为主：纯爱、先婚后爱、久别重逢……
  '奇幻', // 西幻 / 架空魔法世界 / 人外
  '科幻', // 太空、赛博朋克、AI、末日
  '古风', // 中式古代背景：武侠、仙侠、宫廷
  '悬疑', // 推理、刑侦、解谜
  '恐怖', // 规则怪谈、民俗恐怖、哥特
  '校园', // 大学 / 研究生 / 社团（角色一律成年）
  '都市', // 现代都市、职场、市井
  '治愈', // 日常、陪伴、慢生活
  '冒险', // 探险、寻宝、求生
  '历史', // 写实的历史时期：民国、维多利亚、文艺复兴……
  '游戏', // 跑团、文字冒险、海龟汤、模拟经营
  '助手', // 写作、学习、效率等工具型角色
] as const;

export type Category = (typeof CATEGORIES)[number];

/** 找不到合适大类时用这个（旧版的「现代」对应过来） */
export const DEFAULT_CATEGORY: Category = '都市';

/** 「全部」是筛选用的伪分类，不存库 */
export const ALL = '全部';

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** 旧分类 → 新分类（迁移用）。旧四类里只有「现代」不在新表里。 */
export const LEGACY_CATEGORY_MAP: Record<string, Category> = {
  现代: '都市',
  奇幻: '奇幻',
  悬疑: '悬疑',
  治愈: '治愈',
};

/** 常用细分标签：创建表单给建议，导入时也参与归类。广场上的标签行是从卡片实际 tags 统计出来的。 */
export const SUGGESTED_TAGS = [
  '男性向', '女性向', '全性向',
  '纯爱', 'BL', 'GL',
  '慢热', '病娇', '傲娇', '毒舌', '温柔',
  '年上', '年下', '双强', '欢喜冤家', '先婚后爱', '久别重逢',
  '穿越', '重生', '末日', '修仙', '武侠',
  '职场', '豪门', '陪伴', '多角色', '跑团', '人外',
] as const;

/** 广场 / 搜索页默认展示的热门标签数 */
export const HOT_TAG_COUNT = 12;

/** 从卡片 tags 统计出现次数，取前 n 个（与大类同名的标签不重复展示）；次数相同按首次出现顺序 */
export function hotTags(items: { tags: string[] }[], n = HOT_TAG_COUNT): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const raw of new Set(item.tags.map((tag) => tag.trim()).filter(Boolean))) {
      if ((CATEGORIES as readonly string[]).includes(raw) || raw === ALL) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tag, count]) => ({ tag, count }));
}

/** 卡片是否带齐所选标签（多选取交集） */
export function hasAllTags(item: { tags: string[] }, selected: string[]): boolean {
  if (!selected.length) return true;
  const own = new Set(item.tags.map((tag) => tag.trim().toLowerCase()));
  return selected.every((tag) => own.has(tag.trim().toLowerCase()));
}

// ---- 导入时自动归类 ----
// 关键词按「越具体越靠前」排：同分时排在前面的大类胜出（「恋爱」「都市」这类宽泛题材垫底）。
const KEYWORDS: [Category, string[]][] = [
  ['助手', ['助手', '工具', '翻译', '写作', '学习', '口语', '陪练', '效率', '计划', '老师', '答疑', 'assistant', 'helper', 'tutor', 'tool', 'language learning', 'productivity', 'coach']],
  ['游戏', ['跑团', 'trpg', '海龟汤', '文字冒险', '模拟器', '模拟经营', '经营', '种田', '养成', '无限流', '系统', '副本', 'rpg', 'game', 'simulator', 'sandbox', 'text adventure', 'dnd', 'litrpg', 'scenario', 'turtle soup', 'lateral thinking', 'life sim', 'farming sim', 'dice']],
  ['恐怖', ['恐怖', '怪谈', '规则怪谈', '灵异', '惊悚', '鬼', '丧尸', '民俗', '诡异', 'horror', 'ghost', 'creepy', 'gothic', 'zombie', 'slasher', 'eldritch', 'dread']],
  ['科幻', ['科幻', '赛博', '赛博朋克', '太空', '星际', '宇宙', '机甲', '机器人', '仿生人', '末日', '末世', '外星', '未来', 'sci-fi', 'scifi', 'science fiction', 'cyberpunk', 'space', 'robot', 'android', 'alien', 'apocalypse', 'mecha', 'starship', '义体', '义肢', '霓虹', '殖民舰', 'cyborg', 'generation ship']],
  ['古风', ['古风', '武侠', '仙侠', '修仙', '玄幻', '宫廷', '宫斗', '江湖', '王爷', '皇帝', '侠客', '剑修', '古代', 'wuxia', 'xianxia', 'cultivation', '长安', '大理寺', '衙门', '仵作', '书生', '王府', '镖局', '茶寮', '仙门']],
  ['历史', ['历史', '民国', '维多利亚', '中世纪', '文艺复兴', '二战', '江户', '近代', '年代', 'historical', 'victorian', 'medieval', 'regency', 'renaissance', '1920s', 'edo', 'espionage', 'republic era', '1851', '1927']],
  ['悬疑', ['悬疑', '推理', '侦探', '刑侦', '破案', '解谜', '谜案', '凶案', '密室', '谍战', 'mystery', 'detective', 'crime', 'thriller', 'investigation', 'noir', '超自然', '离奇', '线索', 'supernatural', 'profiler']],
  ['奇幻', ['奇幻', '西幻', '魔法', '魔王', '精灵', '龙', '巫师', '女巫', '骑士', '人外', '吸血鬼', '狼人', '异世界', 'fantasy', 'magic', 'magical', 'elf', 'dragon', 'witch', 'wizard', 'vampire', 'werewolf', 'isekai', 'fae', 'monster', '国王', '王国', '王冠', '公主', '王子', 'non-human', 'half-dragon', 'kingdom', 'princess', 'crown']],
  ['冒险', ['冒险', '探险', '寻宝', '航海', '求生', '荒野', '旅行', 'adventure', 'exploration', 'treasure', 'survival', 'quest', 'voyage']],
  ['校园', ['校园', '大学', '学长', '学姐', '社团', '研究生', '图书馆', 'campus', 'college', 'university', 'academy', '博士', 'phd', 'grad school', 'labmate']],
  ['治愈', ['治愈', '日常', '陪伴', '温馨', '慢生活', '树洞', '安慰', '暖心', 'comfort', 'cozy', 'fluff', 'slice of life', 'wholesome', 'healing', '民宿', 'guesthouse', 'slow living']],
  ['恋爱', ['恋爱', '纯爱', '心动', '暧昧', '先婚后爱', '久别重逢', '破镜重圆', '追妻', '甜宠', 'bl', 'gl', 'romance', 'love', 'slow burn', 'slowburn', 'enemies to lovers', 'dating']],
  ['都市', ['都市', '现代', '职场', '总裁', '豪门', '律师', '医生', '娱乐圈', 'modern', 'office', 'urban', 'city', 'workplace', '市井', '夜市', '街头', '消防', 'lawyer', 'firefighter', 'boss', 'night market']],
];

const ASCII_WORD = /^[a-z0-9 \-]+$/;

function countHits(haystack: string, keyword: string): number {
  if (!haystack) return 0;
  if (ASCII_WORD.test(keyword)) {
    // 英文关键词按词边界匹配，避免 "elf" 命中 "herself"
    const re = new RegExp(`(^|[^a-z0-9])${keyword.replace(/[-\s]/g, '[-\\s]?')}([^a-z0-9]|$)`, 'g');
    return (haystack.match(re) ?? []).length;
  }
  return haystack.split(keyword).length - 1;
}

/**
 * 按标签、名字/简介、描述里的关键词给卡片归一个大类。
 * 权重：标签 5（与大类同名的标签 8）、名字和一句话简介 2、描述 1（描述最多算 3 次，免得长设定刷分）。
 * 总分不到 3 时认为没有把握，返回 fallback。
 */
export function classifyCategory(
  input: { tags?: string[]; name?: string; hook?: string; description?: string },
  fallback: Category = DEFAULT_CATEGORY,
): Category {
  const tags = (input.tags ?? []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
  const title = `${input.name ?? ''} ${input.hook ?? ''}`.toLowerCase();
  const body = String(input.description ?? '').slice(0, 6000).toLowerCase();
  let best: Category | null = null;
  let bestScore = 0;
  for (const [category, words] of KEYWORDS) {
    let score = tags.includes(category) ? 8 : 0;
    for (const word of words) {
      const w = word.toLowerCase();
      if (tags.some((tag) => tag === w || (!ASCII_WORD.test(w) && tag.includes(w)) || (ASCII_WORD.test(w) && countHits(tag, w) > 0))) score += 5;
      score += Math.min(countHits(title, w), 2) * 2;
      score += Math.min(countHits(body, w), 3);
    }
    if (score > bestScore) { best = category; bestScore = score; }
  }
  return best && bestScore >= 3 ? best : fallback;
}

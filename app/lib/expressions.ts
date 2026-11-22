// 表情立绘（对齐 SillyTavern 的 Character Expressions 扩展）
// - 标签沿用 ST 的 28 个（文件名 joy.png / joy-2.png / joy_alt.png 都归到 joy）
// - 分类在浏览器本地做（关键词，中英），不额外调模型、不扣点；没对应立绘时按近义回退，最后回到 neutral / 封面

export const EXPRESSION_LABELS = [
  'admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion', 'curiosity', 'desire',
  'disappointment', 'disapproval', 'disgust', 'embarrassment', 'excitement', 'fear', 'gratitude', 'grief', 'joy',
  'love', 'nervousness', 'neutral', 'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise',
] as const;
export type ExpressionLabel = (typeof EXPRESSION_LABELS)[number];

export const EXPRESSION_ZH: Record<ExpressionLabel, string> = {
  admiration: '钦佩', amusement: '逗乐', anger: '生气', annoyance: '不耐烦', approval: '赞同', caring: '关心',
  confusion: '困惑', curiosity: '好奇', desire: '渴望', disappointment: '失望', disapproval: '不满', disgust: '厌恶',
  embarrassment: '害羞', excitement: '兴奋', fear: '害怕', gratitude: '感激', grief: '悲痛', joy: '开心',
  love: '爱意', nervousness: '紧张', neutral: '平静', optimism: '期待', pride: '得意', realization: '恍然',
  relief: '松口气', remorse: '愧疚', sadness: '难过', surprise: '惊讶',
};

const LABEL_SET = new Set<string>(EXPRESSION_LABELS);

/** 文件名 → 标签：joy.png、joy-2.png、Joy_1.webp、sprites/joy.png；认不出返回 null */
export function labelFromFilename(filename: string): ExpressionLabel | null {
  const base = filename.split(/[\\/]/).pop()?.replace(/\.[a-z0-9]+$/i, '').toLowerCase().trim() ?? '';
  if (LABEL_SET.has(base)) return base as ExpressionLabel;
  const head = base.split(/[-_ .]/)[0];
  return LABEL_SET.has(head) ? (head as ExpressionLabel) : null;
}

// 没有这个标签的图时依次尝试的近义标签
const FALLBACK: Partial<Record<ExpressionLabel, ExpressionLabel[]>> = {
  amusement: ['joy'], excitement: ['joy'], optimism: ['joy'], approval: ['joy'], gratitude: ['joy', 'caring'], relief: ['joy'],
  pride: ['joy'], admiration: ['love', 'joy'], love: ['desire', 'joy'], desire: ['love'], caring: ['love', 'joy'],
  annoyance: ['anger'], disapproval: ['annoyance', 'anger'], disgust: ['disapproval', 'anger'],
  grief: ['sadness'], disappointment: ['sadness'], remorse: ['sadness', 'embarrassment'],
  nervousness: ['fear', 'embarrassment'], fear: ['nervousness'], embarrassment: ['nervousness'],
  confusion: ['curiosity', 'surprise'], curiosity: ['confusion'], realization: ['surprise'], surprise: ['realization'],
};

export type SpriteMap = Partial<Record<ExpressionLabel, string[]>>;

/** 按标签挑一张图（同标签多张时按 seed 固定挑一张，免得每次刷新换图） */
export function pickSprite(sprites: SpriteMap, label: ExpressionLabel, seed = 0): { label: ExpressionLabel; src: string } | null {
  const chain: ExpressionLabel[] = [label, ...(FALLBACK[label] ?? []), 'neutral'];
  for (const item of chain) {
    const list = sprites[item];
    if (list?.length) return { label: item, src: list[Math.abs(seed) % list.length] };
  }
  return null;
}

// 关键词表：中文按子串，英文按词（含常见动作描写 *smiles*）
const WORDS: Partial<Record<ExpressionLabel, string[]>> = {
  joy: ['笑', '开心', '高兴', '欢喜', '愉快', '喜悦', '雀跃', '嘻嘻', '哈哈', 'smile', 'smiles', 'smiled', 'grin', 'grins', 'happy', 'glad', 'beam', 'beams', 'cheerful', 'delighted'],
  amusement: ['噗', '忍俊不禁', '笑出声', '逗', '好笑', '调侃', '打趣', 'laugh', 'laughs', 'laughed', 'chuckle', 'chuckles', 'giggle', 'giggles', 'smirk', 'smirks', 'tease', 'teases', 'amused'],
  excitement: ['兴奋', '激动', '迫不及待', '太好了', '耶', 'excited', 'thrilled', 'eager', 'yay'],
  love: ['喜欢你', '爱你', '心动', '温柔地', '深情', '宠溺', '抱住', '亲吻', '吻', 'love', 'loves', 'adore', 'kiss', 'kisses', 'embrace', 'tenderly', 'affection'],
  desire: ['渴望', '想要', '舔', '喘', '欲', '炽热', 'desire', 'crave', 'craves', 'lust', 'yearn', 'longing'],
  caring: ['关心', '担心你', '照顾', '安慰', '轻抚', '摸摸', '心疼', '别怕', 'comfort', 'comforts', 'gently', 'reassure', 'caring', 'worried about you'],
  gratitude: ['谢谢', '感谢', '多谢', '感激', 'thank', 'thanks', 'grateful'],
  admiration: ['佩服', '厉害', '崇拜', '了不起', '钦佩', 'admire', 'impressive', 'amazing', 'wonderful'],
  pride: ['得意', '骄傲', '自豪', '哼哼', '不愧是我', 'proud', 'smug'],
  optimism: ['期待', '一定会', '希望', '会好起来', 'hope', 'hopeful', 'looking forward'],
  approval: ['好啊', '没问题', '可以', '同意', '点头', 'nod', 'nods', 'agree', 'agrees', 'okay', 'sure'],
  relief: ['松了口气', '松口气', '还好', '幸好', '总算', 'relief', 'relieved', 'phew', 'sigh of relief'],
  anger: ['怒', '生气', '火大', '气死', '可恶', '混蛋', '咬牙', '瞪', '吼', 'angry', 'anger', 'furious', 'rage', 'glare', 'glares', 'snarl', 'shout', 'shouts', 'yell'],
  annoyance: ['烦', '啧', '不耐烦', '无语', '白了', '翻了个白眼', '够了', 'annoyed', 'irritated', 'scoff', 'scoffs', 'tch', 'roll her eyes', 'rolls his eyes', 'rolls her eyes', 'eye roll'],
  disapproval: ['不行', '不许', '皱眉', '不满', '反对', '胡闹', 'frown', 'frowns', 'disapprove', 'disapproving', 'no way'],
  disgust: ['恶心', '讨厌', '嫌弃', '呕', 'disgust', 'disgusted', 'gross', 'revolting'],
  sadness: ['难过', '伤心', '哭', '泪', '落寞', '低落', '哽咽', '委屈', 'sad', 'cry', 'cries', 'tears', 'sob', 'sobs', 'weep', 'sorrow'],
  grief: ['悲痛', '痛哭', '绝望', '心碎', '永别', 'grief', 'heartbroken', 'despair', 'mourn'],
  disappointment: ['失望', '叹气', '叹了口气', '算了', '可惜', 'disappointed', 'sigh', 'sighs', 'pity'],
  remorse: ['对不起', '抱歉', '愧疚', '是我的错', '后悔', 'sorry', 'apologize', 'regret', 'guilty', 'remorse'],
  fear: ['害怕', '恐惧', '颤抖', '发抖', '惊恐', '别过来', '救命', 'afraid', 'scared', 'fear', 'terrified', 'tremble', 'trembles', 'shiver'],
  nervousness: ['紧张', '不安', '结巴', '手足无措', '吞了吞口水', '忐忑', 'nervous', 'anxious', 'fidget', 'fidgets', 'stammer', 'stutter', 'gulp'],
  embarrassment: ['脸红', '害羞', '羞', '红了', '低下头', '耳根', '别看', '不好意思', 'blush', 'blushes', 'blushing', 'embarrassed', 'flustered', 'shy'],
  surprise: ['惊讶', '诶', '咦', '居然', '竟然', '愣住', '瞪大', '什么？', '真的吗', 'surprise', 'surprised', 'gasp', 'gasps', 'what?!', 'wow', 'whoa', 'shocked', 'wide-eyed'],
  realization: ['原来如此', '明白了', '原来', '恍然', '懂了', '难怪', 'realize', 'realizes', 'i see', 'oh!', 'that explains'],
  confusion: ['疑惑', '困惑', '歪头', '不明白', '怎么回事', '奇怪', '？？', 'confused', 'puzzled', 'tilts her head', 'tilts his head', 'huh'],
  curiosity: ['好奇', '感兴趣', '凑近', '打量', '是什么', '为什么', 'curious', 'wonder', 'wonders', 'intrigued', 'lean closer'],
};

const PREPARED = Object.entries(WORDS).map(([label, words]) => ({
  label: label as ExpressionLabel,
  zh: words!.filter((word) => /[^\x00-\x7f]/.test(word)),
  en: words!.filter((word) => !/[^\x00-\x7f]/.test(word)).map((word) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z])`, 'gi')),
}));

function countIn(text: string, zh: string[], en: RegExp[]): number {
  let n = 0;
  for (const word of zh) { let i = text.indexOf(word); while (i !== -1) { n++; i = text.indexOf(word, i + word.length); } }
  for (const re of en) n += text.match(re)?.length ?? 0;
  return n;
}

/** 给一段回复判断情绪：后半段（更接近最后的神情）权重翻倍；什么都没命中就是 neutral */
export function classifyExpression(raw: string): ExpressionLabel {
  const text = raw.replace(/<[^>]+>/g, ' ').slice(-2000);
  if (!text.trim()) return 'neutral';
  const tail = text.slice(Math.floor(text.length * 0.6));
  let best: ExpressionLabel = 'neutral';
  let bestScore = 0;
  for (const { label, zh, en } of PREPARED) {
    const score = countIn(text, zh, en) + countIn(tail, zh, en);
    if (score > bestScore) { best = label; bestScore = score; }
  }
  return best;
}

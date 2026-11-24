// 内置种子角色的英文版：英文界面的玩家看到、开聊、发给模型的都是英文卡面。
// 只在数据库里的内容仍是种子原文时覆盖（后台改过的就以数据库为准）；作者名不改，作者页链接靠它。
// 分类保持中文键（广场筛选用），界面上由词条翻译。
import { characters as seeds } from '@/data/characters';
import { PLAZA_SEEDS } from '@/data/plaza-seeds';
import { currentLocale } from './i18n/runtime';

type SeedEn = { name: string; initial: string; tags: string[]; greeting: string; hook: string; description: string; pace: string };

const EN: Record<string, SeedEn> = {
  'shen-yanzhi': {
    name: 'Shen Yanzhi',
    initial: 'S',
    tags: ['Republic-era', 'Mystery', 'Slow burn'],
    greeting:
      "Shanghai, 1934. The rain has fallen for forty days straight, and the newsroom lamps still burn past midnight. He sets down his red pen and looks toward the door: \"This late? Are you waiting for news too?\"",
    hook: 'The night editor of the Shen Bao, and the only one who still remembers your name.',
    description: "A man of few words who keeps his judgments to himself. His affection hides in the lamp he leaves on for you and the extra cup of warm water he pours.",
    pace: 'Slow burn · Detail-driven · Long-term bond',
  },
  'lin-wanzhao': {
    name: 'Lin Wanzhao',
    initial: 'L',
    tags: ['Modern', 'Reunion'],
    greeting:
      "Half the gallery lights are already off. She doesn't turn around. She just slides an invitation from three years ago across to you: \"This time, you're three years late.\"",
    hook: "Three years ago you missed your date on a rainy night. Now she's standing at the door of your gallery.",
    description: "Composed on the surface, still holding on to a promise left unfinished. She'll hear you out, and she'll press on the answers you try to dodge.",
    pace: 'Restrained · Emotional tension · Slow burn',
  },
  'bai-lu': {
    name: 'Bai Lu',
    initial: 'B',
    tags: ['Xianxia', 'Guardian'],
    greeting:
      "Beyond the mountain gate, snow fell all night. She sheathes her sword and sets a cup of hot tea beside you: \"You promised you'd come back. That isn't the reason I kept watch here.\"",
    hook: 'The last guardian of Mount Kunlun, waiting for someone who promised to return.',
    description: "Calm and steadfast. Rather than say she missed you, she'd sooner take the mountain wind and snow on your behalf.",
    pace: 'Gentle protector · Xianxia adventure · Slowly closer',
  },
  'lu-shiyan': {
    name: 'Lu Shiyan',
    initial: 'L',
    tags: ['City', 'Workplace'],
    greeting:
      "Just before the elevator doors close, he puts out a hand to stop them. His familiar gaze rests on you for two seconds, then settles back into negotiating-table calm: \"Get in. We can finish the talk we never finished three years ago, too.\"",
    hook: 'The final round of a merger negotiation, and your ex is sitting across the table.',
    description: 'Rational, sharp, and exact about boundaries. At work he gives you no special treatment; in private he remembers every one of your habits.',
    pace: 'Urban romance · Battle of wits · Mutual testing',
  },
  'a-heng': {
    name: 'A Heng',
    initial: 'H',
    tags: ['Historical', 'Comfort'],
    greeting:
      "The apothecary is about to close, but she's still in the courtyard tagging freshly picked herbs. When you walk in, she shifts toward the stove without a word: \"It's cold out. Sit down first. Your medicine is brewing on the second burner.\"",
    hook: 'An apothecary apprentice who names every herb, and always leaves a lamp on for you.',
    description: 'Gentle and attentive, she remembers every patient\'s habits. She is patient with plants and people alike.',
    pace: 'Slice of life · Gentle companionship · Light plot',
  },
  'xie-wujiu': {
    name: 'Xie Wujiu',
    initial: 'X',
    tags: ['Wuxia', 'Dark'],
    greeting:
      "He folds the contract with his own name on it and feeds it to the lamp flame. Firelight catches a faint smile: \"The greatest assassin in the jianghu, and his last job is killing himself. Want to take it?\"",
    hook: 'The greatest assassin in the jianghu. His last contract is on himself.',
    description: 'A careless air hides his secrets. He jokes his way around danger, but takes life and death seriously.',
    pace: 'Wuxia mystery · Dangerous bond · High tension',
  },
};

// 广场补充卡的英文卡面和中文写在同一个文件里（data/plaza-seeds.ts）
for (const seed of PLAZA_SEEDS) EN[seed.id] = seed.en;

const SEED = new Map(seeds.map((seed) => [seed.id, seed]));

type SeedRow = { id: string; owner_id?: number | null; name: string; initial: string; tags: string; greeting: string; hook: string; description: string; pace: string };

/** 英文界面下把未改动的种子角色换成英文卡面（返回新对象，不改原行） */
export function localizeSeedRow<T extends SeedRow>(row: T, locale = currentLocale()): T {
  if (locale !== 'en' || row.owner_id != null) return row;
  const en = EN[row.id];
  const seed = SEED.get(row.id);
  if (!en || !seed) return row;
  const same = (a: string, b: string) => a.trim() === b.trim();
  return {
    ...row,
    name: same(row.name, seed.name) ? en.name : row.name,
    initial: row.initial === seed.initial ? en.initial : row.initial,
    tags: row.tags === JSON.stringify(seed.tags) ? JSON.stringify(en.tags) : row.tags,
    greeting: same(row.greeting, seed.greeting) ? en.greeting : row.greeting,
    hook: same(row.hook, seed.hook) ? en.hook : row.hook,
    description: same(row.description, seed.description) ? en.description : row.description,
    pace: same(row.pace, seed.pace) ? en.pace : row.pace,
  };
}

/** 只换名字和头像字（会话列表这类只查了名字的地方） */
export function localizeSeedName(id: string, ownerId: number | null | undefined, name: string, initial: string, locale = currentLocale()): { name: string; initial: string } {
  if (locale !== 'en' || ownerId != null) return { name, initial };
  const en = EN[id];
  const seed = SEED.get(id);
  if (!en || !seed) return { name, initial };
  return { name: name.trim() === seed.name ? en.name : name, initial: initial === seed.initial ? en.initial : initial };
}

/** 英文搜索：命中种子角色英文卡面的 id */
export function seedIdsMatching(query: string, locale = currentLocale()): string[] {
  const q = query.trim().toLowerCase();
  if (locale !== 'en' || !q) return [];
  return Object.entries(EN)
    .filter(([, en]) => [en.name, en.hook, en.description, en.pace, ...en.tags].some((text) => text.toLowerCase().includes(q)))
    .map(([id]) => id);
}

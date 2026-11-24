import { classifyCategory } from '@/lib/catalog';

// 解析 SillyTavern 角色卡 V1/V2/V3 JSON（PNG 由 lib/png-card.ts 先取出 JSON）。
// 平台表单字段在这里；世界书、正则、深度提示、原始数据见 lib/card-extras.ts。
export type ImportedCard = {
  name: string;
  hook: string;
  greeting: string;
  description: string;
  pace: string;
  tags: string[];
  category: string;
  nsfw: boolean;
  alternateGreetings: { title: string; text: string }[];
  card: { personality: string; scenario: string; mesExample: string; systemPrompt: string; postHistory: string; creatorNotes: string };
};

type Record_ = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

export function parseStCharacterCard(input: unknown): ImportedCard | null {
  const raw = input && typeof input === 'object' ? (input as Record_) : null;
  if (!raw) return null;
  const data = raw.data && typeof raw.data === 'object' ? (raw.data as Record_) : raw;
  const name = text(data.name ?? raw.name).trim();
  if (!name) return null;
  const description = text(data.description ?? raw.description);
  const personality = text(data.personality ?? raw.personality);
  const scenario = text(data.scenario ?? raw.scenario);
  const firstMes = text(data.first_mes ?? data.firstMessage ?? raw.first_mes ?? raw.greeting);
  const examples = text(data.mes_example ?? raw.mes_example);
  const tags = Array.isArray(data.tags) ? data.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 12) : [];
  const nsfw = tags.some((tag) => /nsfw|r18|r-18|18\+|成人/i.test(tag));
  const creatorNotes = text(data.creator_notes ?? raw.creator_notes);
  const hook = text(data.creatorcomment ?? raw.creatorcomment) || description.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 60) || `${name} 的故事`;
  // 高级字段原样落到 card_fields，不再拼进简介（拼接会把对话示例当成设定喂给模型）
  const systemPrompt = text(data.system_prompt ?? raw.system_prompt);
  const postHistory = text(data.post_history_instructions ?? raw.post_history_instructions);
  const alternates = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 40).map((text, index) => ({ title: `备用开场 ${index + 1}`, text }))
    : [];
  return {
    name: name.slice(0, 32),
    hook: hook.slice(0, 90),
    greeting: (firstMes || `（${name} 看着你，等你先开口。）`).slice(0, 30000),
    description: (description || personality || scenario).slice(0, 60000),
    pace: '慢热 · 细节叙事',
    tags,
    // 按卡上的标签、名字、简介和描述关键词归一个大类；没把握时用默认大类
    category: classifyCategory({ tags, name, hook: `${hook} ${creatorNotes.slice(0, 400)}`, description: `${description}\n${personality}\n${scenario}` }),
    nsfw,
    alternateGreetings: alternates,
    card: { personality, scenario, mesExample: examples, systemPrompt, postHistory, creatorNotes },
  };
}

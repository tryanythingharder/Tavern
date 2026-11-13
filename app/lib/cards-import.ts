// 解析 SillyTavern 角色卡 V2/V3 JSON（PNG 卡先不处理）
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
  const tags = Array.isArray(data.tags) ? data.tags.map(String).filter(Boolean).slice(0, 5) : [];
  const creatorNotes = text(data.creator_notes ?? raw.creator_notes);
  const hook = text(data.creatorcomment ?? raw.creatorcomment) || description.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 60) || `${name} 的故事`;
  const descriptionParts = [
    description,
    personality ? `性格：${personality}` : '',
    scenario ? `场景：${scenario}` : '',
    examples ? `对话示例：\n${examples}` : '',
    creatorNotes ? `作者备注：${creatorNotes}` : '',
  ].filter(Boolean);
  const alternates = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8).map((text, index) => ({ title: `备用开场 ${index + 1}`, text }))
    : [];
  return {
    name: name.slice(0, 32),
    hook: hook.slice(0, 90),
    greeting: (firstMes || `（${name} 看着你，等你先开口。）`).slice(0, 2000),
    description: descriptionParts.join('\n\n').slice(0, 3000),
    pace: '慢热 · 细节叙事',
    tags,
    category: '现代',
    nsfw: false,
    alternateGreetings: alternates,
  };
}

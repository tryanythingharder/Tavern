import { CARD_FIELD_LIMITS, type CardFields } from '@/lib/characters';

// 角色卡字段长度上限（第二轮审计 C6）。
// 原来各字段在入库前悄悄 slice：20 万字的角色名会被无声截成 32 字，备用开场 / 标签干脆没有上限。
// 现在：超过上限直接 400 并说清是哪个字段、多长、上限多少；上限取原来的存储上限（社区长卡的正常长度都在其内），
// 只有角色名留了余量——ST 卡里 33–64 字的名字并不少见，仍按原逻辑截到 32 字，超过 64 字才拒绝。
export const CARD_LIMITS = {
  /** 存储长度（编辑器 maxLength 也是 32） */
  name: 32,
  /** 导入 / 接口里超过这个长度直接拒绝；32–64 之间照旧截断 */
  nameReject: 64,
  greeting: 30000,
  description: 60000,
  alternateText: 30000,
  alternateCount: 40,
  tag: 40,
  tagCount: 12,
} as const;

const FIELD_LABEL: Record<keyof CardFields, string> = {
  // 与创建/编辑表单（components/character-form.tsx）上的字段名一致
  personality: '性格（personality）',
  scenario: '场景（scenario）',
  mesExample: '对话示例（mes_example）',
  systemPrompt: '系统提示（system_prompt）',
  postHistory: '后置指令（post_history_instructions）',
  creatorNotes: '作者备注（creator_notes）',
};

export type CardLimitInput = {
  name?: unknown;
  greeting?: unknown;
  description?: unknown;
  alternates?: unknown[];
  card?: Partial<Record<keyof CardFields, unknown>> | null;
};

const len = (value: unknown) => (typeof value === 'string' ? value.length : typeof value === 'number' ? String(value).length : 0);
const tooLong = (label: string, size: number, limit: number) => `「${label}」太长：${size} 字，上限 ${limit} 字`;

/** 返回第一条超限说明；都在上限内返回 null */
export function cardLimitError(input: CardLimitInput): string | null {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length > CARD_LIMITS.nameReject) return `角色名太长：${name.length} 字，请控制在 ${CARD_LIMITS.name} 字以内`;
  if (len(input.greeting) > CARD_LIMITS.greeting) return tooLong('开场白', len(input.greeting), CARD_LIMITS.greeting);
  if (len(input.description) > CARD_LIMITS.description) return tooLong('角色描述', len(input.description), CARD_LIMITS.description);
  const alternates = Array.isArray(input.alternates) ? input.alternates : [];
  for (let index = 0; index < alternates.length; index += 1) {
    const item = alternates[index];
    const size = len(typeof item === 'object' && item !== null ? (item as { text?: unknown }).text : item);
    if (size > CARD_LIMITS.alternateText) return tooLong(`备用开场 ${index + 1}`, size, CARD_LIMITS.alternateText);
  }
  for (const key of Object.keys(FIELD_LABEL) as (keyof CardFields)[]) {
    const size = len(input.card?.[key]);
    if (size > CARD_FIELD_LIMITS[key]) return tooLong(FIELD_LABEL[key], size, CARD_FIELD_LIMITS[key]);
  }
  return null;
}

/** SillyTavern 卡（V1/V2/V3 原始 JSON）：按 parseStCharacterCard 读字段的同一套路径取值再检查 */
export function stCardLimitError(input: unknown): string | null {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!raw) return null;
  const data = raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : raw;
  return cardLimitError({
    name: data.name ?? raw.name,
    greeting: data.first_mes ?? data.firstMessage ?? raw.first_mes ?? raw.greeting,
    description: data.description ?? raw.description,
    alternates: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.slice(0, CARD_LIMITS.alternateCount) : [],
    card: {
      personality: data.personality ?? raw.personality,
      scenario: data.scenario ?? raw.scenario,
      mesExample: data.mes_example ?? raw.mes_example,
      systemPrompt: data.system_prompt ?? raw.system_prompt,
      postHistory: data.post_history_instructions ?? raw.post_history_instructions,
      creatorNotes: data.creator_notes ?? raw.creator_notes,
    },
  });
}

/** 编辑器 / 接口提交的 CharacterInput（lib/characters.ts） */
export function characterInputLimitError(input: Record<string, unknown>): string | null {
  const alternates = Array.isArray(input.alternateGreetings)
    ? input.alternateGreetings.slice(0, CARD_LIMITS.alternateCount)
    : typeof input.alternateGreetings === 'string'
      ? input.alternateGreetings.split(/\n\s*---\s*\n/).slice(0, CARD_LIMITS.alternateCount)
      : [];
  const card = input.card && typeof input.card === 'object' ? (input.card as Partial<Record<keyof CardFields, unknown>>) : null;
  return cardLimitError({ name: input.name, greeting: input.greeting, description: input.description, alternates, card });
}

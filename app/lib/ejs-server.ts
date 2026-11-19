import { parseCardFields } from '@/lib/characters';
import { loadExtras } from '@/lib/card-extras';
import type { DbCharacter, DbMessage } from '@/lib/db';
import { hasEjs, runEjs, type EjsError, type EjsSet, type EjsVars } from '@/lib/ejs';
import { readHelperVars, writeHelperVars } from '@/lib/helper-vars';
import type { MvuState } from '@/lib/mvu';
import type { ChatMessage } from '@/lib/model';
import type { LoreEntry } from '@/lib/resources';

// 把 EJS 接到平台：生成前处理整份提示词（setvar 不落库），收到回复后处理一次（setvar 落库），
// 显示楼层时再渲染一次（<%= %> 转义 HTML，不落库）。和 ST-Prompt-Template 的三个阶段对应。

export type EjsContext = {
  userId: number;
  chatId: number;
  character: DbCharacter;
  userName: string;
  loreEntries: LoreEntry[];
  history: Pick<DbMessage, 'id' | 'role' | 'content'>[];
  model: string;
  variables: MvuState | null;
  generateType?: string;
};

function scopes(state: MvuState | null): EjsVars {
  return {
    global: (state?.scoped?.global as Record<string, unknown>) ?? {},
    local: (state?.scoped?.chat as Record<string, unknown>) ?? {},
    message: state ? { stat_data: state.stat_data, display_data: state.display_data, delta_data: state.delta_data } : {},
  };
}

function base(ctx: EjsContext, runType: string) {
  const fields = parseCardFields(ctx.character.card_fields);
  const visible = ctx.history.filter((message) => message.role !== 'system');
  const lastUser = [...visible].reverse().find((message) => message.role === 'user');
  const lastChar = [...visible].reverse().find((message) => message.role === 'assistant');
  const indexOf = (message: { id: number } | undefined) => (message ? visible.findIndex((item) => item.id === message.id) : -1);
  const bookName = loadExtras(ctx.character.id).book?.name ?? '';
  return {
    env: {
      runType,
      userName: ctx.userName,
      charName: ctx.character.name,
      chatId: String(ctx.chatId),
      characterId: ctx.character.id,
      groupId: null,
      groups: [],
      model: ctx.model,
      generateType: ctx.generateType ?? '',
      lastUserMessage: lastUser?.content ?? '',
      lastCharMessage: lastChar?.content ?? '',
      lastUserMessageId: indexOf(lastUser),
      lastCharMessageId: indexOf(lastChar),
      lastMessageId: visible.length - 1,
      charLoreBook: bookName || undefined,
      userLoreBook: undefined,
      chatLoreBook: undefined,
    },
    lore: ctx.loreEntries.map((entry) => ({ uid: String(entry.id).replace(/^card-/, ''), title: entry.title, content: entry.text, book: String(entry.id).startsWith('card-') ? bookName : '' })),
    char: {
      name: ctx.character.name,
      description: ctx.character.description ?? '',
      personality: fields.personality ?? '',
      scenario: fields.scenario ?? '',
      first_mes: ctx.character.greeting ?? '',
      mes_example: fields.mesExample ?? '',
    },
    messages: visible.map((message) => ({ role: message.role, content: message.content })),
    charLoreBook: bookName,
  };
}

const stripCode = (text: string) => text.replace(/<%(?!%)[\s\S]*?%>/g, '');

/** 生成前第一步：世界书条目逐条处理（一条写坏不影响别的）。出错的条目去掉代码块后发送。 */
export async function templateLore(entries: LoreEntry[], ctx: EjsContext): Promise<{ entries: LoreEntry[]; errors: EjsError[] }> {
  const targets = entries.map((entry, index) => ({ entry, index })).filter((item) => hasEjs(item.entry.text));
  if (!targets.length) return { entries, errors: [] };
  const result = await runEjs({
    ...base({ ...ctx, loreEntries: entries }, 'generate'),
    vars: scopes(ctx.variables),
    texts: targets.map((item) => ({ text: item.entry.text, name: item.entry.title })),
    persist: false,
    timeoutMs: 400,
  });
  const next = entries.slice();
  targets.forEach((item, i) => {
    next[item.index] = { ...item.entry, text: result.out[i] ?? stripCode(item.entry.text) };
  });
  return { entries: next, errors: result.errors.map((error) => ({ ...error, name: targets[error.index]?.entry.title ?? error.name })) };
}

/** 生成前：处理将要发给模型的每条消息。出错的那条保留原文。 */
export async function templatePrompt(messages: ChatMessage[], ctx: EjsContext): Promise<{ messages: ChatMessage[]; errors: EjsError[] }> {
  if (!messages.some((message) => hasEjs(message.content))) return { messages, errors: [] };
  const result = await runEjs({
    ...base(ctx, 'generate'),
    vars: scopes(ctx.variables),
    texts: messages.map((message, index) => ({ text: message.content, name: `${message.role}#${index}` })),
    persist: false,
  });
  const out = messages.map((message, index) => result.out[index] ?? message.content);
  // 整条出错（多半是某一条世界书里写坏了/死循环）：按空行切段重来，只有坏的那段保留原文
  const failed = messages.map((_, index) => index).filter((index) => result.out[index] === null && hasEjs(messages[index].content));
  if (failed.length) {
    const pieces: { msg: number; text: string }[] = [];
    for (const index of failed) for (const text of messages[index].content.split(/(\n)/)) pieces.push({ msg: index, text });
    const retry = await runEjs({
      ...base(ctx, 'generate'),
      vars: scopes(ctx.variables),
      texts: pieces.map((piece, i) => ({ text: piece.text, name: `${messages[piece.msg].role}#${piece.msg}.${i}` })),
      persist: false,
      timeoutMs: 300,
    });
    for (const index of failed) out[index] = pieces.map((piece, i) => (piece.msg === index ? retry.out[i] ?? stripCode(piece.text) : '')).join('');
    return { messages: messages.map((message, index) => ({ ...message, content: out[index] })), errors: retry.errors.length ? retry.errors : result.errors };
  }
  return { messages: messages.map((message, index) => ({ ...message, content: out[index] })), errors: result.errors };
}

/** 收到回复后：跑一遍回复里的 EJS，setvar 落到聊天/全局变量。消息正文照原文存。 */
export async function applyReplyTemplates(text: string, ctx: EjsContext): Promise<{ sets: number; errors: EjsError[] }> {
  if (!hasEjs(text)) return { sets: 0, errors: [] };
  const result = await runEjs({ ...base(ctx, 'render'), vars: scopes(ctx.variables), texts: [{ text, name: 'reply' }], persist: true });
  if (result.sets.length) persistSets(ctx.userId, ctx.chatId, result.sets);
  return { sets: result.sets.length, errors: result.errors };
}

/** 显示楼层：渲染出给人看的文本（不落库）。 */
export async function renderMessage(text: string, ctx: EjsContext, extra: Record<string, unknown> = {}): Promise<{ text: string; errors: EjsError[] }> {
  if (!hasEjs(text)) return { text, errors: [] };
  const result = await runEjs({ ...base(ctx, 'render'), vars: scopes(ctx.variables), texts: [{ text, name: 'render', data: extra }], persist: false, escape: false });
  return { text: result.out[0] ?? text, errors: result.errors };
}

// message 作用域没有单独的存处（楼层变量来自 MVU 重放），并到聊天变量里，读的时候 cache 一样能读到
function persistSets(userId: number, chatId: number, sets: EjsSet[]) {
  const buckets: Record<'chat' | 'global', Record<string, unknown> | null> = { chat: null, global: null };
  const load = (scope: 'chat' | 'global') => (buckets[scope] ??= readHelperVars(userId, scope, scope === 'chat' ? String(chatId) : '') ?? {});
  for (const item of sets) {
    const scope = item.scope === 'global' ? 'global' : 'chat';
    const tree = load(scope);
    if (!item.key.length) continue;
    let cur: Record<string, unknown> = tree;
    for (const part of item.key.slice(0, -1)) {
      const next = cur[part];
      if (!next || typeof next !== 'object') cur[part] = {};
      cur = cur[part] as Record<string, unknown>;
    }
    const last = item.key[item.key.length - 1];
    if (item.op === 'del') delete cur[last];
    else cur[last] = item.value;
  }
  if (buckets.chat) writeHelperVars(userId, 'chat', String(chatId), buckets.chat);
  if (buckets.global) writeHelperVars(userId, 'global', '', buckets.global);
}

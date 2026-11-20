import { fail, idParam, json, requireUser } from '@/lib/api';
import { addMessage, deleteMessagesFrom, getChat, setMessagesHidden, type DbMessage } from '@/lib/db';
import db from '@/lib/db';
import { toMessageView } from '@/lib/chat-view';
import { loadGenerationConfig, personaSender } from '@/lib/resources-db';
import { moderateText } from '@/lib/auto-moderation';
import { readHelperVars } from '@/lib/helper-vars';
import { applyStVarMacros, makeVarStore, varOp, type VarOp } from '@/lib/st-vars';
import { persistVarStore } from '@/lib/st-vars-server';
import { expandStMacros } from '@/lib/st-macros';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function allMessages(chatId: number): DbMessage[] {
  return db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id').all(chatId) as DbMessage[];
}

// ST 楼层号（mesid，从 0 开始）：「3」「2-5」「3,7,9」
function parseRange(spec: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of String(spec).split(/[\s,，]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    for (let index = Math.min(from, to); index <= Math.max(from, to) && index < total; index += 1) out.add(index);
  }
  return [...out].sort((a, b) => a - b);
}

// POST /api/chats/[id]/ops —— 对话页的 ST 操作（斜杠命令也走这里）
//   { op: 'hide' | 'unhide', ids?: number[], range?: '2-5' }   隐藏/取消隐藏（不发给模型）
//   { op: 'delete-from', messageId }                           删除这一条及之后的全部消息
//   { op: 'narrate', text }                                    插入旁白（/sys），按 system 发给模型
//   { op: 'send', text }                                       只发送玩家消息，不让角色回复（/send）
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { op?: string; ids?: unknown; range?: unknown; messageId?: unknown; text?: unknown };

  if (body.op === 'hide' || body.op === 'unhide') {
    const list = allMessages(chat.id);
    let ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((value) => Number.isInteger(value) && value > 0) : [];
    if (typeof body.range === 'string') ids = parseRange(body.range, list.length).map((index) => list[index].id);
    if (!ids.length) return fail('没有要处理的消息', 400);
    const hidden = body.op === 'hide';
    const changed = setMessagesHidden(chat.id, ids, hidden);
    return json({ ok: true, changed, ids, hidden });
  }

  // { op: 'delete', range: '3-5' } 或 { op: 'delete', last: 2 }（ST /cut、/del）
  if (body.op === 'delete') {
    const list = allMessages(chat.id);
    const last = Number((body as { last?: unknown }).last);
    const indexes = typeof body.range === 'string' ? parseRange(body.range, list.length) : Number.isInteger(last) && last > 0 ? list.map((_, index) => index).slice(-last) : [];
    if (!indexes.length) return fail('没有要删除的消息', 400);
    const stmt = db.prepare('DELETE FROM messages WHERE chat_id = ? AND id = ?');
    for (const index of indexes) stmt.run(chat.id, list[index].id);
    return json({ ok: true, deleted: indexes.length });
  }

  // 变量（ST /setvar 等，和 {{setvar}} 宏、酒馆助手 chat/global 变量同一份）
  //   { op: 'var', scope: 'chat'|'global', action: 'set'|'get'|'add'|'inc'|'dec'|'flush'|'list', name, value }
  //   { op: 'expand', text }  斜杠命令参数里的宏（{{getvar::x}}、{{roll:1d6}}…）
  if (body.op === 'var' || body.op === 'expand') {
    const owner = { userId: user.id, chatScopeId: String(chat.id) };
    const store = makeVarStore({ chat: readHelperVars(user.id, 'chat', owner.chatScopeId) ?? {}, global: readHelperVars(user.id, 'global', '') ?? {} });
    const extra = body as { scope?: unknown; action?: unknown; name?: unknown; value?: unknown };
    if (body.op === 'expand') {
      const text = expandStMacros(applyStVarMacros(String(body.text ?? ''), store).replace(/\{\{getvar::[^}]*\}\}|\{\{getglobalvar::[^}]*\}\}/gi, ''));
      persistVarStore(store, owner);
      return json({ ok: true, text });
    }
    if (extra.action === 'list') return json({ ok: true, chat: store.chat, global: store.global });
    const scope = extra.scope === 'global' ? 'global' : 'chat';
    const action = String(extra.action ?? '') as VarOp;
    if (!['set', 'get', 'add', 'inc', 'dec', 'flush'].includes(action)) return fail('参数不对', 400);
    const name = String(extra.name ?? '').trim().slice(0, 200);
    if (!name) return fail('要写变量名', 400);
    const value = varOp(store, scope, action, name, String(extra.value ?? '').slice(0, 20000));
    persistVarStore(store, owner);
    return json({ ok: true, value: action === 'set' || action === 'add' ? '' : value, current: store[scope][name] ?? null });
  }

  if (body.op === 'delete-from') {
    const messageId = Number(body.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) return fail('参数不对', 400);
    const count = deleteMessagesFrom(chat.id, messageId);
    return json({ ok: true, deleted: count });
  }

  if (body.op === 'narrate' || body.op === 'send') {
    const text = String(body.text ?? '').trim().slice(0, 20000);
    if (!text) return fail('内容不能为空', 400);
    const verdict = await moderateText(text);
    if (!verdict.ok) return fail(verdict.message, 422);
    const saved = body.op === 'narrate'
      ? addMessage(chat.id, 'system', text)
      : addMessage(chat.id, 'user', text, undefined, undefined, personaSender(user.id, loadGenerationConfig(user.id, chat).persona));
    return json({ ok: true, message: toMessageView(saved) });
  }

  // { op: 'sendas', text, name? }  以角色身份插一条消息、不生成（/sendas）；{ op: 'comment', text }  注释：隐藏的旁白，不发给模型（/comment）
  if (body.op === 'sendas' || body.op === 'comment') {
    const text = String(body.text ?? '').trim().slice(0, 20000);
    if (!text) return fail('内容不能为空', 400);
    const verdict = await moderateText(text);
    if (!verdict.ok) return fail(verdict.message, 422);
    if (body.op === 'comment') {
      const saved = addMessage(chat.id, 'system', text);
      setMessagesHidden(chat.id, [saved.id], true);
      return json({ ok: true, message: { ...toMessageView({ ...saved }), hidden: true } });
    }
    const name = String((body as { name?: unknown }).name ?? '').trim().slice(0, 60);
    const saved = addMessage(chat.id, 'assistant', text, undefined, undefined, name ? { name, avatar: null } : null);
    return json({ ok: true, message: toMessageView(saved) });
  }

  return fail('未知操作', 400);
}

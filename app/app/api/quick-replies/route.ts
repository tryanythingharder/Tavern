import { fail, json, requireUser } from '@/lib/api';
import { getChat } from '@/lib/db';
import db from '@/lib/db';
import { fromStSet } from '@/lib/quick-replies';
import { createQrSet, listQrSets, qrState, setGlobalQrSets, setScopeQrSets, updateQrSet } from '@/lib/quick-replies-db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

function scopeOf(userId: number, chatId: unknown, roomId: unknown): { chatId: number } | { roomId: number } | null | undefined {
  const chat = Number(chatId);
  const room = Number(roomId);
  if (Number.isInteger(chat) && chat > 0) return getChat(chat, userId) ? { chatId: chat } : null;
  if (Number.isInteger(room) && room > 0) return db.prepare('SELECT id FROM rooms WHERE id = ? AND user_id = ?').get(room, userId) ? { roomId: room } : null;
  return undefined;
}

// GET /api/quick-replies?chatId=|roomId=  全部集 + 全局启用 + 本聊天启用
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const url = new URL(request.url);
  const scope = scopeOf(user.id, url.searchParams.get('chatId'), url.searchParams.get('roomId'));
  if (scope === null) return fail('会话不存在', 404);
  return json(qrState(user.id, scope));
}

// POST { action: 'create', name } | { action: 'import', data }（ST 导出的 QR 集 JSON，可以是数组）| 旧版 { label, content }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { action?: string; name?: string; data?: unknown; label?: string; content?: string };
  if (body.action === 'import') {
    const list = Array.isArray(body.data) ? body.data : [body.data];
    const existing = listQrSets(user.id);
    const created: { id: number; name: string }[] = [];
    const parsed = list.map((item) => ({ raw: item, first: fromStSet(item) })).filter((item) => item.first);
    if (!parsed.length) return fail('不是 SillyTavern 快捷回复集文件（要有 qrList）', 400);
    // 先建空集拿到 id，再按名字解析 contextList（同一批里互相引用也能对上）
    for (const item of parsed) created.push({ id: createQrSet(user.id, { ...item.first!.set }).id, name: item.first!.set.name });
    const byName = (name: string) => created.find((set) => set.name === name)?.id ?? existing.find((set) => set.name === name)?.id ?? null;
    parsed.forEach((item, index) => {
      const full = fromStSet(item.raw, byName)!;
      updateQrSet(user.id, created[index].id, { replies: full.replies });
    });
    return json({ ok: true, created, ...qrState(user.id) }, 201);
  }
  if (body.action === 'create') {
    const set = createQrSet(user.id, { name: String(body.name ?? '').trim() || '新快捷回复集' });
    return json({ set, ...qrState(user.id) }, 201);
  }
  const label = String(body.label ?? '').trim();
  const content = String(body.content ?? '').trim();
  if (!label || !content) return fail('标签和内容都要填', 400);
  const sets = listQrSets(user.id);
  const target = sets[0] ?? createQrSet(user.id, { name: '我的快捷回复', disableSend: true });
  const set = updateQrSet(user.id, target.id, { replies: [...target.replies, { label, message: content }] });
  return json({ set }, 201);
}

// PUT { globalIds: number[] | null } 全局启用；{ chatId | roomId, scopeIds: number[] } 本聊天启用
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { globalIds?: unknown; scopeIds?: unknown; chatId?: unknown; roomId?: unknown };
  const scope = scopeOf(user.id, body.chatId, body.roomId);
  if (scope === null) return fail('会话不存在', 404);
  if ('globalIds' in body) setGlobalQrSets(user.id, body.globalIds === null ? null : Array.isArray(body.globalIds) ? body.globalIds.map(Number) : []);
  if (scope && Array.isArray(body.scopeIds)) setScopeQrSets(user.id, scope, body.scopeIds.map(Number));
  return json(qrState(user.id, scope ?? undefined));
}

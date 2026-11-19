import db, { getChat } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { loadExtras } from '@/lib/card-extras';
import { helperScriptsFromRaw, runnableScripts } from '@/lib/helper-scripts';
import { HELPER_SCOPES, readHelperVars, writeHelperVars, type HelperScope } from '@/lib/helper-vars';
import { chatVariables } from '@/lib/mvu-server';

export const dynamic = 'force-dynamic';

const FLOOR_LIMIT = 100;

// GET /api/chats/[id]/helper?scripts=1 —— 酒馆助手脚本运行器的快照（components/helper-runner.tsx）
//   scripts  卡里要跑的脚本（只在 scripts=1 时给，正文可能很大）
//   vars     chat / character / global / script{id} 变量表，message = 最新一楼的 MVU 变量
//   floors   最近 100 楼（message_id 是从 0 开始的楼层号，和酒馆一致）
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: '未登录' }, { status: 401 });
  const { id } = await context.params;
  const chat = getChat(Number(id), user.id);
  if (!chat) return Response.json({ message: '会话不存在' }, { status: 404 });
  const withScripts = new URL(request.url).searchParams.get('scripts') === '1';
  const { scripts: all, variables } = helperScriptsFromRaw(loadExtras(chat.character_id).raw);
  const scripts = runnableScripts(all);
  const scriptVars: Record<string, unknown> = {};
  for (const script of scripts) scriptVars[script.id] = readHelperVars(user.id, 'script', `${chat.character_id}:${script.id}`) ?? script.data;
  const rows = db.prepare('SELECT id, role, content FROM messages WHERE chat_id = ? ORDER BY id').all(chat.id) as { id: number; role: string; content: string }[];
  const start = Math.max(0, rows.length - FLOOR_LIMIT);
  const floors = rows.slice(start).map((row, index) => ({ message_id: start + index, id: row.id, role: row.role, message: row.content }));
  const state = chatVariables(chat.id, chat.character_id);
  return Response.json(
    {
      scripts: withScripts ? scripts : undefined,
      skipped: withScripts ? all.filter((script) => script.skipped).map((script) => ({ id: script.id, name: script.name, reason: script.skipped })) : undefined,
      vars: {
        chat: readHelperVars(user.id, 'chat', String(chat.id)) ?? {},
        character: readHelperVars(user.id, 'character', chat.character_id) ?? variables,
        global: readHelperVars(user.id, 'global', '') ?? {},
        script: scriptVars,
        message: { stat_data: state.stat_data, display_data: state.display_data, delta_data: state.delta_data },
      },
      floors,
      total: rows.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// PUT /api/chats/[id]/helper { scope, scriptId?, data } —— 脚本改了变量，整表写回
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: '未登录' }, { status: 401 });
  const { id } = await context.params;
  const chat = getChat(Number(id), user.id);
  if (!chat) return Response.json({ message: '会话不存在' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { scope?: string; scriptId?: string; data?: unknown } | null;
  const scope = body?.scope as HelperScope;
  if (!body || !HELPER_SCOPES.includes(scope) || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return Response.json({ message: '参数不对' }, { status: 400 });
  }
  let scopeId = '';
  if (scope === 'chat') scopeId = String(chat.id);
  else if (scope === 'character') scopeId = chat.character_id;
  else if (scope === 'script') {
    const scriptId = String(body.scriptId ?? '').slice(0, 80);
    if (!scriptId) return Response.json({ message: '缺少脚本 id' }, { status: 400 });
    scopeId = `${chat.character_id}:${scriptId}`;
  }
  if (!writeHelperVars(user.id, scope, scopeId, body.data as Record<string, unknown>)) return Response.json({ message: '变量太大（上限 256 KB）' }, { status: 413 });
  return Response.json({ ok: true });
}

import { fail, json, requireUser } from '@/lib/api';
import { getCharacterView } from '@/lib/characters';
import { labelFromFilename, EXPRESSION_LABELS, type ExpressionLabel } from '@/lib/expressions';
import { addSprite, countOwn, deleteSprites, listSprites, relabelSprite } from '@/lib/sprites-db';
import { saveMedia } from '@/lib/storage';
import { readZip } from '@/lib/zip-read';
import { imageExt } from '@/lib/image-ext';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
const MAX_OWN = 200;
const MAX_FILE = 5 * 1024 * 1024;

async function load(context: Params) {
  const user = await requireUser();
  if (!user) return { error: fail('未登录', 401) } as const;
  const { id } = await context.params;
  const character = getCharacterView(id);
  if (!character) return { error: fail('角色不存在', 404) } as const;
  return { user, character } as const;
}

// GET /api/characters/[id]/sprites —— 作者的 + 自己的表情立绘
export async function GET(_request: Request, context: Params) {
  const ctx = await load(context);
  if ('error' in ctx) return ctx.error;
  return json({ sprites: listSprites(ctx.character.id, ctx.user.id, ctx.character.ownerId), isAuthor: ctx.character.ownerId === ctx.user.id });
}

// POST multipart：files（图片或 ST 表情 zip，文件名即标签）、label（单张图时可指定）
export async function POST(request: Request, context: Params) {
  const ctx = await load(context);
  if ('error' in ctx) return ctx.error;
  const form = await request.formData().catch(() => null);
  if (!form) return fail('请上传文件');
  const forced = String(form.get('label') || '');
  const forcedLabel = (EXPRESSION_LABELS as readonly string[]).includes(forced) ? (forced as ExpressionLabel) : null;
  const items: { name: string; data: Buffer }[] = [];
  for (const file of form.getAll('files')) {
    if (typeof file === 'string') continue;
    const data = Buffer.from(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name) || (data[0] === 0x50 && data[1] === 0x4b)) {
      try { items.push(...readZip(data)); } catch (error) { return fail((error as Error).message); }
    } else items.push({ name: file.name, data });
  }
  let room = MAX_OWN - countOwn(ctx.character.id, ctx.user.id);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const label = forcedLabel && items.length === 1 ? forcedLabel : labelFromFilename(item.name);
    const ext = imageExt(item.data);
    if (!label || !ext || item.data.length > MAX_FILE || room <= 0) { skipped.push(item.name.split('/').pop() || item.name); continue; }
    const src = saveMedia(item.data, ext, { ownerId: ctx.user.id, visibility: 'public' });
    addSprite(ctx.character.id, ctx.user.id, label, src);
    added.push(label);
    room--;
  }
  return json({ added: added.length, skipped, sprites: listSprites(ctx.character.id, ctx.user.id, ctx.character.ownerId) });
}

// PATCH { id, label } 改标签
export async function PATCH(request: Request, context: Params) {
  const ctx = await load(context);
  if ('error' in ctx) return ctx.error;
  const body = (await request.json().catch(() => ({}))) as { id?: number; label?: string };
  if (!body.id || !(EXPRESSION_LABELS as readonly string[]).includes(body.label ?? '')) return fail('参数不对');
  if (!relabelSprite(ctx.character.id, ctx.user.id, body.id, body.label as ExpressionLabel)) return fail('只能改自己上传的', 403);
  return json({ sprites: listSprites(ctx.character.id, ctx.user.id, ctx.character.ownerId) });
}

// DELETE { ids } 或 { all: true }，只删自己上传的
export async function DELETE(request: Request, context: Params) {
  const ctx = await load(context);
  if ('error' in ctx) return ctx.error;
  const body = (await request.json().catch(() => ({}))) as { ids?: number[]; all?: boolean };
  const removed = deleteSprites(ctx.character.id, ctx.user.id, body.all ? 'all' : (body.ids ?? []).filter(Number.isInteger));
  return json({ removed, sprites: listSprites(ctx.character.id, ctx.user.id, ctx.character.ownerId) });
}

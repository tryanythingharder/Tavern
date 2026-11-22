import { fail, json, requireUser } from '@/lib/api';
import { MAX_BACKGROUNDS, addBackground, deleteBackground, globalBackground, listBackgrounds, ownsBackground, renameBackground, setGlobalBackground } from '@/lib/backgrounds';
import { imageExt } from '@/lib/image-ext';
import { saveMedia } from '@/lib/storage';
import { readZip } from '@/lib/zip-read';

export const dynamic = 'force-dynamic';
const MAX_FILE = 8 * 1024 * 1024;

const state = (userId: number) => ({ backgrounds: listBackgrounds(userId), global: globalBackground(userId) });

// GET /api/backgrounds —— 我的背景库 + 默认背景
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json(state(user.id));
}

// POST multipart files（图片或 zip）—— 加进背景库
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const form = await request.formData().catch(() => null);
  if (!form) return fail('请上传图片');
  const items: { name: string; data: Buffer }[] = [];
  for (const file of form.getAll('files')) {
    if (typeof file === 'string') continue;
    const data = Buffer.from(await file.arrayBuffer());
    if (data[0] === 0x50 && data[1] === 0x4b) {
      try { items.push(...readZip(data)); } catch (error) { return fail((error as Error).message); }
    } else items.push({ name: file.name, data });
  }
  let room = MAX_BACKGROUNDS - listBackgrounds(user.id).length;
  let added = 0;
  const skipped: string[] = [];
  for (const item of items) {
    const ext = imageExt(item.data);
    const name = (item.name.split('/').pop() || '背景').replace(/\.[a-z0-9]+$/i, '');
    if (!ext || item.data.length > MAX_FILE || room <= 0) { skipped.push(name); continue; }
    addBackground(user.id, name, saveMedia(item.data, ext, { ownerId: user.id, visibility: 'public' }));
    added++; room--;
  }
  return json({ added, skipped, ...state(user.id) });
}

// PUT { global: src|null } 设默认；{ id, name } 改名
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { global?: string | null; id?: number; name?: string };
  if (body.id && typeof body.name === 'string') {
    if (!body.name.trim() || !renameBackground(user.id, body.id, body.name.trim())) return fail('改名失败');
  } else if ('global' in body) {
    const src = body.global || null;
    if (src && !ownsBackground(user.id, src)) return fail('背景不在你的背景库里');
    setGlobalBackground(user.id, src);
  } else return fail('参数不对');
  return json(state(user.id));
}

// DELETE { id }
export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  if (!body.id || !deleteBackground(user.id, body.id)) return fail('背景不存在', 404);
  return json(state(user.id));
}

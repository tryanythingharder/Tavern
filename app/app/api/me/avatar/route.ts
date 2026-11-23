import { fail, json, requireUser } from '@/lib/api';
import { getProfileMedia, setProfileMedia } from '@/lib/auth';
import { imageExt } from '@/lib/image-ext';
import { rateLimit } from '@/lib/rate-limit';
import { deleteMediaUrl, saveMedia } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// 浏览器端已裁剪压缩（头像 512²、背景 1500×600），这里只兜底校验
const LIMIT = { avatar: 2 * 1024 * 1024, banner: 4 * 1024 * 1024 } as const;
type Kind = keyof typeof LIMIT;
const kindOf = (value: unknown): Kind | null => (value === 'avatar' || value === 'banner' ? value : null);

// GET /api/me/avatar —— 当前头像与背景
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json(getProfileMedia(user.id));
}

// POST multipart { kind: avatar|banner, file } —— 换头像 / 背景图
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const limited = rateLimit('profile-media', [String(user.id)], 20, 60 * 60 * 1000);
  if (!limited.ok) return fail('换得太频繁了，过一会儿再试', 429);
  const form = await request.formData().catch(() => null);
  const kind = kindOf(form?.get('kind'));
  const file = form?.get('file');
  if (!kind || !file || typeof file === 'string') return fail('请选择图片');
  const data = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(data);
  if (!ext) return fail('只支持 PNG、JPG、WebP 或 GIF 图片');
  if (data.length > LIMIT[kind]) return fail(`图片太大了，${kind === 'avatar' ? '头像' : '背景图'}最多 ${LIMIT[kind] / 1024 / 1024} MB`);
  const previous = getProfileMedia(user.id)[kind];
  const url = saveMedia(data, ext, { ownerId: user.id, visibility: 'public' });
  setProfileMedia(user.id, kind, url);
  deleteMediaUrl(previous, user.id); // 旧图不再被引用，顺手清掉
  return json(getProfileMedia(user.id));
}

// DELETE ?kind=avatar|banner —— 恢复默认
export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const kind = kindOf(new URL(request.url).searchParams.get('kind'));
  if (!kind) return fail('参数不对');
  const previous = getProfileMedia(user.id)[kind];
  setProfileMedia(user.id, kind, null);
  deleteMediaUrl(previous, user.id);
  return json(getProfileMedia(user.id));
}

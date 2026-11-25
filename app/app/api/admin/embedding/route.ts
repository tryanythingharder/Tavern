import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { deleteSetting, setSetting } from '@/lib/settings';
import { logAdmin } from '@/lib/audit';
import { embedConfig, embedStatus, embedTexts } from '@/lib/vectors';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

async function admin() {
  const user = await requireUser();
  if (!user) return { error: fail('未登录', 401) };
  if (!isAdmin(user)) return { error: fail('没有权限', 403) };
  return { user };
}

// GET /api/admin/embedding —— 向量模型配置状态（密钥不回传）
export async function GET() {
  const auth = await admin();
  if (auth.error) return auth.error;
  return json(embedStatus());
}

// PATCH —— { baseUrl, apiKey（留空不改）, model, clearKey? }
export async function PATCH(request: Request) {
  const auth = await admin();
  if (auth.error) return auth.error;
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { baseUrl?: unknown; apiKey?: unknown; model?: unknown; clearKey?: unknown };
  if (typeof body.baseUrl === 'string') {
    const url = body.baseUrl.trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) return fail('Base URL 需要以 http:// 或 https:// 开头', 400);
    if (url) setSetting('embed.baseUrl', url); else deleteSetting('embed.baseUrl');
  }
  if (typeof body.model === 'string') {
    if (body.model.trim()) setSetting('embed.model', body.model.trim()); else deleteSetting('embed.model');
  }
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) setSetting('embed.apiKey', body.apiKey.trim());
  if (body.clearKey === true) deleteSetting('embed.apiKey');
  logAdmin(auth.user.id, '修改向量模型配置', '');
  return json(embedStatus());
}

// POST —— 测试：向量化一句话，返回维度
export async function POST() {
  const auth = await admin();
  if (auth.error) return auth.error;
  const config = embedConfig();
  if (!config) return fail('请先填写 Base URL、API Key 和模型', 400);
  try {
    const [vec] = await embedTexts(['夜色里，她把伞递给了他。'], config);
    return json({ ok: true, dimensions: vec.length });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

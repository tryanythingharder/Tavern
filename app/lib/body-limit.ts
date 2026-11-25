// 上传接口的请求体上限：在 formData() 把整个请求读进内存之前拦住超大请求。
// - 有 Content-Length 且超限：直接 413，不读请求体
// - 没有 Content-Length（分块传输）：边读边计数，超过上限就停止读取并 413
export class BodyTooLarge extends Error {
  constructor(readonly limit: number) {
    super(`请求体超过 ${Math.round(limit / 1024 / 1024)} MB`);
  }
}

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${Math.round(bytes / 1024)} KB`);

export function tooLarge(limit: number): Response {
  return Response.json({ message: `上传内容太大，单次最多 ${sizeText(limit)}`, code: 'too_large' }, { status: 413 });
}

// 返回 null 表示请求体不是合法的 multipart/form-data（与原来 formData().catch(() => null) 的语义一致）
export async function readFormLimited(request: Request, limit: number): Promise<FormData | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > limit) throw new BodyTooLarge(limit);
  if (declared !== null && /^\d+$/.test(declared.trim())) return request.formData().catch(() => null);
  if (!request.body) return request.formData().catch(() => null);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge(limit);
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  return new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData().catch(() => null);
}

// 路由里一行用：const form = await formOr413(request, LIMIT); if (form instanceof Response) return form;
export async function formOr413(request: Request, limit: number): Promise<FormData | null | Response> {
  try {
    return await readFormLimited(request, limit);
  } catch (error) {
    if (error instanceof BodyTooLarge) return tooLarge(limit);
    throw error;
  }
}

// JSON 接口（各类导入）的请求体上限：同上，超限 413；解析失败返回 fallback（与原来 request.json().catch(() => fallback) 一致）
export const IMPORT_JSON_LIMIT = 32 * 1024 * 1024;

export async function readTextLimited(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > limit) throw new BodyTooLarge(limit);
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge(limit);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// 解析 JSON 文本前去掉开头的 BOM（\uFEFF）：从记事本 / 部分编辑器复制、或带 BOM 存的文件里粘贴的 JSON 开头会带它，
// JSON.parse 会直接报错。只去开头那一个，字符串值里的 \uFEFF 原样保留。
export function parseJsonText(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

// 路由里一行用：const body = await jsonOr413(request, IMPORT_JSON_LIMIT, {}); if (body instanceof Response) return body;
export async function jsonOr413<T>(request: Request, limit: number, fallback: T): Promise<unknown | T | Response> {
  let text: string;
  try {
    text = await readTextLimited(request, limit);
  } catch (error) {
    if (error instanceof BodyTooLarge) return tooLarge(limit);
    return fallback;
  }
  try {
    return parseJsonText(text);
  } catch {
    return fallback;
  }
}

// ── 普通 JSON 接口的统一请求体上限（第二轮审计 C8） ──
// 原来约 90 个需登录的路由直接 request.json()：请求体多大都整份读进内存再解析。
// 现在统一走 readJson：按路由类型取上限（Content-Length 先拦，分块传输边读边数），超限 413。
// 默认 1MB：聊天消息、设置、后台配置等普通请求远小于它；
// 放宽到 32MB 的只有「整份文档」类：导入、建卡/改卡（封面和形象以 dataURL 内嵌，各最多 8MB）、
// 世界书 / 预设 / 资料库（单文件 200 万字）/ 正则 / 快捷回复的整份保存——和导入同一上限，导入进来的东西改完还能存回去。
// 认证类（auth/*，16KB）与 /api/client-error（64KB）仍在各自路由里用 jsonOr413 单独给更紧的上限。
export const BODY_LIMITS = {
  auth: 16 * 1024,
  clientError: 64 * 1024,
  json: 1024 * 1024,
  large: IMPORT_JSON_LIMIT,
} as const;

const LARGE_JSON_ROUTES = [
  /\/import$/,
  /^\/api\/characters(?:\/[^/]+)?$/,
  /^\/api\/(?:lorebooks|presets|data-bank|regex|quick-replies)(?:\/.*)?$/,
];

/** 按路径给出 JSON 请求体上限（字节） */
export function jsonLimitFor(pathname: string): number {
  if (pathname.startsWith('/api/auth/')) return BODY_LIMITS.auth;
  if (pathname === '/api/client-error') return BODY_LIMITS.clientError;
  return LARGE_JSON_ROUTES.some((re) => re.test(pathname)) ? BODY_LIMITS.large : BODY_LIMITS.json;
}

function pathOf(request: Request): string {
  try { return new URL(request.url).pathname; } catch { return ''; }
}

// 替代 `request.json().catch(() => fallback)`：
//   const parsed = await readJson(request, {}); if (parsed instanceof Response) return parsed;
// 解析失败（含空请求体）返回 fallback，语义与原写法一致；超限返回 413 响应。limit 不传时按路径取默认。
export async function readJson<T>(request: Request, fallback: T, limit = jsonLimitFor(pathOf(request))): Promise<unknown | T | Response> {
  return jsonOr413(request, limit, fallback);
}

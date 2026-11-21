import { fail, json, requireUser } from '@/lib/api';
import { addDataBankFile } from '@/lib/data-bank';
import { checkScope } from '@/lib/data-bank-scope';
import { BINARY_DOC, extractDocText } from '@/lib/doc-extract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 20 * 1024 * 1024;

// POST /api/data-bank/upload —— multipart：file + scope + scopeId；PDF / docx / epub / odt 转成文字存进资料库
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File)) return fail('没有文件', 400);
  if (!BINARY_DOC.test(file.name)) return fail('这里只接收 PDF、Word（.docx）、EPUB、ODT', 400);
  if (file.size > MAX_BYTES) return fail('文件超过 20 MB', 400);
  const scope = checkScope(user.id, form.get('scope') ?? 'global', form.get('scopeId'));
  if (!scope) return fail('作用范围不对', 400);
  let text: string;
  try {
    text = await extractDocText(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return fail(`「${file.name}」读取失败：${error instanceof Error ? error.message : String(error)}`, 400);
  }
  const result = addDataBankFile(user.id, { ...scope, name: file.name, content: text });
  if ('error' in result) return fail(result.error, 400);
  return json({ file: result });
}

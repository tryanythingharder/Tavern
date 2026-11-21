import { getCharacterById, getChat } from '@/lib/db';
import { getRoom } from '@/lib/rooms';
import { DATA_BANK_SCOPES, type DataBankScope } from '@/lib/data-bank';

/** 校验作用范围：聊天 / 群聊必须是自己的，角色必须存在 */
export function checkScope(userId: number, scope: unknown, scopeId: unknown): { scope: DataBankScope; scopeId: string } | null {
  if (typeof scope !== 'string' || !DATA_BANK_SCOPES.includes(scope as DataBankScope)) return null;
  const id = String(scopeId ?? '');
  if (scope === 'global') return { scope, scopeId: '' };
  if (scope === 'character') return getCharacterById(id) ? { scope, scopeId: id } : null;
  if (scope === 'chat') return getChat(Number(id), userId) ? { scope, scopeId: String(Number(id)) } : null;
  return getRoom(Number(id), userId) ? { scope: 'room', scopeId: String(Number(id)) } : null;
}

/** 上传的文件转成纯文本：HTML 去标签，其余原样 */
export function fileText(name: string, raw: string): string {
  if (/\.(html?|xhtml)$/i.test(name)) {
    return raw
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return raw;
}

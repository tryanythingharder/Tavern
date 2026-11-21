// ST 背景/表情斜杠命令（前端执行）：/bg /lockbg /unlockbg /expression-set /expression-list
import { EXPRESSION_LABELS, EXPRESSION_ZH, type ExpressionLabel } from '@/lib/expressions';

type Bg = { id: number; name: string; src: string };
type BgResult = { notice: string; pipe: string; changed: boolean };

export const MEDIA_SLASH = new Set(['bg', 'lockbg', 'unlockbg', 'expression-set', 'expression-list']);

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || '操作失败');
  return data;
}

// ST 的 /bg 按名字模糊匹配：完全相同 > 开头相同 > 包含
export function matchBackground(list: Bg[], query: string): Bg | null {
  const q = query.trim().toLowerCase().replace(/\.(png|jpe?g|webp|gif)$/i, '');
  if (!q) return null;
  const name = (bg: Bg) => bg.name.toLowerCase();
  return list.find((bg) => name(bg) === q) ?? list.find((bg) => name(bg).startsWith(q)) ?? list.find((bg) => name(bg).includes(q)) ?? null;
}

/**
 * /bg 名字：换背景。和 ST 一样——这段故事锁定了背景就换锁定的那张，否则换全局默认。
 * /bg（不带参数）：返回当前背景名。/lockbg：把当前背景锁到这段故事。/unlockbg：改回跟随默认。
 */
export async function runBgCommand(kind: 'chat' | 'room', id: number, name: string, arg: string): Promise<BgResult> {
  const threadUrl = `/api/${kind === 'chat' ? 'chats' : 'rooms'}/${id}/background`;
  const lib = await call<{ backgrounds: Bg[]; global: string | null }>('/api/backgrounds');
  const thread = await call<{ src: string | null; locked: boolean; value: string | null }>(threadUrl, { method: 'GET' }).catch(() => null);
  const nameOf = (src: string | null) => (src ? lib.backgrounds.find((bg) => bg.src === src)?.name ?? '（未命名）' : '（无）');
  const locked = thread?.locked ?? false;
  const current = thread ? thread.src : lib.global;

  if (name === 'lockbg') {
    await call(threadUrl, { method: 'PUT', body: JSON.stringify({ value: current ?? '' }) });
    return { notice: `已把背景「${nameOf(current)}」锁定到这段故事`, pipe: nameOf(current), changed: true };
  }
  if (name === 'unlockbg') {
    await call(threadUrl, { method: 'PUT', body: JSON.stringify({ value: null }) });
    return { notice: '已解锁，这段故事改回跟随默认背景', pipe: '', changed: true };
  }
  if (!arg.trim()) return { notice: `当前背景：${nameOf(current)}${locked ? '（锁定在这段故事）' : ''}`, pipe: nameOf(current), changed: false };
  const none = /^(none|无|无背景|off)$/i.test(arg.trim());
  const found = none ? null : matchBackground(lib.backgrounds, arg);
  if (!none && !found) throw new Error(`背景库里没有「${arg.trim()}」${lib.backgrounds.length ? `。有：${lib.backgrounds.slice(0, 8).map((bg) => bg.name).join('、')}${lib.backgrounds.length > 8 ? '…' : ''}` : '，先在「背景」里上传'}`);
  if (locked) await call(threadUrl, { method: 'PUT', body: JSON.stringify({ value: found?.src ?? '' }) });
  else await call('/api/backgrounds', { method: 'PUT', body: JSON.stringify({ global: found?.src ?? null }) });
  const label = found?.name ?? '无背景';
  return { notice: `背景已换成「${label}」${locked ? '（这段故事）' : '（默认）'}`, pipe: label, changed: true };
}

// 表情：英文标签或中文名都认
export function parseExpression(arg: string): ExpressionLabel | null {
  const q = arg.trim().toLowerCase();
  if (!q) return null;
  if ((EXPRESSION_LABELS as readonly string[]).includes(q)) return q as ExpressionLabel;
  const zh = (Object.entries(EXPRESSION_ZH) as [ExpressionLabel, string][]).find(([, value]) => value === arg.trim());
  return zh ? zh[0] : null;
}

export const EXPRESSION_EVENT = 'tavern:expression-set';

export function runExpressionCommand(name: string, arg: string): { notice: string; pipe: string } {
  if (name === 'expression-list') {
    const list = EXPRESSION_LABELS.map((label) => `${label}（${EXPRESSION_ZH[label]}）`).join('、');
    return { notice: `可用表情：${list}`, pipe: JSON.stringify(EXPRESSION_LABELS) };
  }
  const label = parseExpression(arg);
  if (!label) throw new Error(`没有这个表情「${arg.trim()}」，输入 /expression-list 查看`);
  window.dispatchEvent(new CustomEvent(EXPRESSION_EVENT, { detail: { label } }));
  return { notice: `表情已切到「${EXPRESSION_ZH[label]}」，下一条回复会重新判断`, pipe: label };
}

import { getSetting } from '@/lib/settings';
import { reportError } from '@/lib/monitor';

// 自动内容审核（可选）：配置 TAVERN_MODERATION_KEY（OpenAI API key）即启用，调用免费的 omni-moderation 接口。
// 成人 RP 平台默认只拦截违法类别（涉未成年性内容）；可用 TAVERN_MODERATION_BLOCK 逗号分隔追加类别，
// 例如 "sexual/minors,self-harm/instructions,violence/graphic"。接口出错时放行并告警，不影响正常对话。
const DEFAULT_BLOCK = 'sexual/minors';

export function moderationEnabled(): boolean {
  return Boolean(moderationKey());
}

function moderationKey(): string {
  return getSetting('moderation.key', process.env.TAVERN_MODERATION_KEY ?? '');
}

function blockedCategories(): string[] {
  return getSetting('moderation.block', process.env.TAVERN_MODERATION_BLOCK ?? DEFAULT_BLOCK)
    .split(',').map((item) => item.trim()).filter(Boolean);
}

export type ModerationVerdict = { ok: true } | { ok: false; categories: string[]; message: string };

export async function moderateText(text: string): Promise<ModerationVerdict> {
  const key = moderationKey();
  const input = text.trim().slice(0, 20000);
  if (!key || !input) return { ok: true };
  const base = (process.env.TAVERN_MODERATION_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/moderations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.TAVERN_MODERATION_MODEL || 'omni-moderation-latest', input }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`moderation ${res.status}`);
    const data = (await res.json()) as { results?: { categories?: Record<string, boolean> }[] };
    const flagged = Object.entries(data.results?.[0]?.categories ?? {}).filter(([, hit]) => hit).map(([name]) => name);
    const hits = flagged.filter((name) => blockedCategories().includes(name));
    if (!hits.length) return { ok: true };
    return { ok: false, categories: hits, message: '这段内容违反社区规则，没有发送。' };
  } catch (error) {
    reportError({ source: 'server', message: `自动审核失败，已放行：${(error as Error).message}`, path: 'moderation' });
    return { ok: true };
  }
}

// 把角色卡等对象里的所有字符串拼起来送审（跳过 data: 图片）。
export function flattenText(value: unknown, out: string[] = [], depth = 0): string {
  if (depth > 6) return out.join('\n');
  if (typeof value === 'string') {
    if (!value.startsWith('data:')) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) flattenText(item, out, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) flattenText(item, out, depth + 1);
  }
  return out.join('\n');
}

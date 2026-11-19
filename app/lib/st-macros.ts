// SillyTavern 的常用文本宏（世界书、角色设定、预设里都会用）。在提示词组装时展开（lib/prompt.ts）。
//   {{// 注释}}           删掉
//   {{roll:1d10}}         掷骰，也认 {{roll::2d6+1}}、{{roll 20}}（= 1d20）
//   {{random::a::b}}      每次随机选一个，也认 {{random:a,b}}
//   {{pick::a::b}}        同一会话里稳定地选一个（按 seed + 位置）
//   {{newline}} {{trim}} {{noop}} {{time}} {{date}} {{weekday}} {{isodate}} {{isotime}}
// 其它宏（{{char}}/{{user}}/变量宏）由调用方处理。

type Ctx = { seed?: string; now?: Date; rand?: () => number };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function roll(spec: string, rand: () => number): string | null {
  const s = spec.trim().replace(/\s+/g, '');
  const plain = /^\d+$/.test(s) ? `1d${s}` : s;
  const m = plain.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  const count = Math.min(100, Math.max(1, Number(m[1] || 1)));
  const sides = Math.max(1, Math.min(100000, Number(m[2])));
  let total = Number(m[3] || 0);
  for (let i = 0; i < count; i++) total += 1 + Math.floor(rand() * sides);
  return String(total);
}

function options(body: string): string[] {
  // random::a::b 或 random:a,b（逗号可用 \, 转义）
  if (body.startsWith('::')) return body.slice(2).split('::');
  if (body.startsWith(':')) return body.slice(1).split(/(?<!\\),/).map((item) => item.replace(/\\,/g, ',').trim());
  return [];
}

export function expandStMacros(text: string, ctx: Ctx = {}): string {
  if (!text || !text.includes('{{')) return text;
  const rand = ctx.rand ?? Math.random;
  const now = ctx.now ?? new Date();
  let pickIndex = 0;
  let out = text.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');
  out = out.replace(/\{\{(roll|random|pick)(\s+|:{1,2})([^{}]*)\}\}/gi, (whole, name: string, sep: string, rest: string) => {
    const kind = name.toLowerCase();
    if (kind === 'roll') return roll(rest, rand) ?? whole;
    const list = options((sep.trim() ? sep : ':') + rest);
    if (!list.length) return whole;
    if (kind === 'random') return list[Math.floor(rand() * list.length)] ?? '';
    const seed = hash(`${ctx.seed ?? ''}:${pickIndex++}:${rest}`);
    return list[seed % list.length] ?? '';
  });
  const pad = (n: number) => String(n).padStart(2, '0');
  out = out
    .replace(/\{\{newline\}\}/gi, '\n')
    .replace(/\{\{noop\}\}/gi, '')
    .replace(/\{\{time\}\}/gi, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replace(/\{\{date\}\}/gi, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
    .replace(/\{\{isodate\}\}/gi, now.toISOString().slice(0, 10))
    .replace(/\{\{isotime\}\}/gi, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replace(/\{\{weekday\}\}/gi, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]);
  out = out.replace(/\s*\{\{trim\}\}\s*/gi, '');
  return out;
}

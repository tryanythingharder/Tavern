import type { RegexRule } from '@/lib/resources';

// 正则规则的执行（服务端组装提示词、客户端渲染消息共用；不能引入任何服务端模块）。
// 兼容 SillyTavern 正则脚本：/pattern/flags 写法、{{match}}、trimStrings、{{char}}/{{user}} 宏。

const REGEX_TEXT_LIMIT = 200000;

// 平台自建规则总是全局替换（老行为）；角色卡自带的脚本（id < 0）照 ST 尊重原 flags
export function compileRule(rule: Pick<RegexRule, 'find'>, forceGlobal = true): RegExp | null {
  const raw = rule.find;
  if (!raw) return null;
  const literal = raw.match(/^\/([^]*)\/([a-z]*)$/);
  try {
    if (literal) {
      const flags = [...new Set(literal[2].split('').filter((char) => 'gimsuy'.includes(char)))].join('');
      if (!literal[1]) return null;
      return new RegExp(literal[1], forceGlobal && !flags.includes('g') ? `${flags}g` : flags);
    }
    return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  } catch {
    return null;
  }
}

export type RegexMacros = { char?: string; user?: string };

function macro(text: string, macros?: RegexMacros): string {
  if (!macros) return text;
  return text
    .replace(/\{\{char\}\}/gi, macros.char ?? '')
    .replace(/\{\{user\}\}/gi, macros.user ?? '');
}

export function applyRegex(
  rules: RegexRule[],
  text: string,
  options: { target: 'user' | 'assistant'; purpose: 'send' | 'display'; depth?: number; macros?: RegexMacros },
): string {
  let value = String(text ?? '');
  if (value.length > REGEX_TEXT_LIMIT) value = value.slice(0, REGEX_TEXT_LIMIT);
  for (const rule of rules) {
    if (!rule.enabled || !rule.find) continue;
    if (rule.scope !== 'both' && rule.scope !== options.purpose) continue;
    if (rule.target !== 'all' && rule.target !== options.target) continue;
    if (typeof options.depth === 'number') {
      if (rule.depthFrom !== null && rule.depthFrom >= -1 && options.depth < rule.depthFrom) continue;
      if (rule.depthTo !== null && rule.depthTo >= 0 && options.depth > rule.depthTo) continue;
    }
    const regex = compileRule({ find: macro(rule.find, options.macros) }, rule.id >= 0);
    if (!regex) continue;
    const replacement = macro(rule.replacement, options.macros);
    const trims = rule.trim ?? [];
    try {
      value = value.replace(regex, (...args: unknown[]) => {
        // args: match, p1..pn, offset, input, [groups]
        const hasGroups = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null;
        const groups = (hasGroups ? args[args.length - 1] : {}) as Record<string, string | undefined>;
        const captures = args.slice(1, hasGroups ? -3 : -2) as (string | undefined)[];
        let matched = String(args[0]);
        for (const piece of trims) matched = matched.split(piece).join('');
        return replacement
          .replace(/\{\{match\}\}/gi, matched)
          .replace(/\$\$/g, '\u0000')
          .replace(/\$&/g, matched)
          .replace(/\$<([^>]+)>/g, (_, name: string) => groups[name] ?? '')
          .replace(/\$(\d{1,2})/g, (_, n: string) => captures[Number(n) - 1] ?? '')
          .replace(/\u0000/g, '$');
      });
    } catch {
      // 单条规则出错不影响整段文本
    }
  }
  return value;
}

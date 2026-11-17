// 把一条消息切成「普通叙事文本」和「HTML 片段」（卡片美化、状态栏、状态图）。
// HTML 片段交给沙盒 iframe 渲染（components/html-frame.tsx），普通文本仍走 RpText。
// 纯函数，客户端/服务端都能用。

export type RichSegment = { kind: 'text'; text: string } | { kind: 'html'; html: string };

const BLOCK_TAGS = new Set([
  'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'details', 'summary', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'style', 'script', 'img', 'svg', 'button', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'center', 'html', 'body', 'head',
  'link', 'meta', 'audio', 'video', 'figure', 'figcaption', 'progress', 'meter', 'canvas', 'blockquote', 'pre', 'form', 'input', 'label', 'select', 'textarea', 'p', 'font',
]);
// 只认这些标签开头的行是 HTML 块；行内的 <b>/<i>/<span>/<br> 不单独起块
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'col', 'area', 'base', 'wbr', 'track', 'embed', 'param']);
const KNOWN_TAGS = new Set([...BLOCK_TAGS, 'span', 'b', 'i', 'u', 's', 'em', 'strong', 'small', 'big', 'sub', 'sup', 'a', 'br', 'mark', 'code', 'kbd', 'q', 'abbr', 'source', 'rect', 'path', 'circle', 'g', 'text', 'line', 'polyline', 'polygon', 'ellipse', 'defs', 'linearGradient', 'stop', 'option', 'col', 'colgroup', 'caption']);

const OPEN_LINE = /^\s*<(!doctype|[a-z][a-z0-9-]*)\b/i;
const TAG_RE = /<(\/?)([a-z][a-z0-9-]*)\b[^<>]*?(\/?)>/gi;

function looksLikeHtml(code: string): boolean {
  return /<\s*(!doctype|html|body|div|style|table|section|details|svg|img|script|span|p)\b/i.test(code);
}

function depthDelta(line: string): number {
  let delta = 0;
  for (const match of line.matchAll(TAG_RE)) {
    const [, closing, rawName, selfClose] = match;
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name) || selfClose) continue;
    if (!KNOWN_TAGS.has(name) && !KNOWN_TAGS.has(rawName)) continue;
    delta += closing ? -1 : 1;
  }
  return delta;
}

// ST 会把不认识的自定义标签（<StatusBlock>、<thinking>…）的标签本身吞掉，只留内容
function stripUnknownTags(text: string): string {
  return text.replace(/<\/?([A-Za-z_][\w:.-]*)(\s[^<>]*)?\/?>/g, (whole, name: string) => (KNOWN_TAGS.has(name.toLowerCase()) ? whole : ''));
}

function splitHtmlLines(text: string, out: RichSegment[]) {
  const lines = text.split('\n');
  let buffer: string[] = [];
  const flushText = () => {
    if (!buffer.length) return;
    const value = stripUnknownTags(buffer.join('\n'));
    if (value.trim()) out.push({ kind: 'text', text: value });
    buffer = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const open = line.match(OPEN_LINE);
    const tag = open?.[1].toLowerCase();
    if (!tag || !(tag === '!doctype' || BLOCK_TAGS.has(tag))) {
      buffer.push(line);
      continue;
    }
    flushText();
    const html: string[] = [line];
    let depth = depthDelta(line);
    let inRaw = /<(style|script)\b[^>]*>(?![\s\S]*<\/\1>)/i.exec(line)?.[1]?.toLowerCase() ?? null;
    while (index + 1 < lines.length && (depth > 0 || inRaw)) {
      index += 1;
      const next = lines[index];
      html.push(next);
      if (inRaw) {
        if (new RegExp(`</${inRaw}>`, 'i').test(next)) inRaw = null;
        else continue;
      }
      depth += depthDelta(next);
    }
    const prev = out[out.length - 1];
    if (prev?.kind === 'html') prev.html += `\n${html.join('\n')}`;
    else out.push({ kind: 'html', html: html.join('\n') });
  }
  flushText();
}

export function splitRich(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  if (!text || !/[<`]/.test(text)) return [{ kind: 'text', text }];
  const fence = /```([\w-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const match of text.matchAll(fence)) {
    const [whole, lang, code] = match;
    const start = match.index ?? 0;
    const isHtml = (/^(html?|xml|svg|)$/i.test(lang) && looksLikeHtml(code));
    if (!isHtml) continue;
    if (start > last) splitHtmlLines(text.slice(last, start), out);
    const prev = out[out.length - 1];
    if (prev?.kind === 'html') prev.html += `\n${code}`;
    else out.push({ kind: 'html', html: code });
    last = start + whole.length;
  }
  if (last < text.length) splitHtmlLines(text.slice(last), out);
  return out.length ? out : [{ kind: 'text', text: '' }];
}

export function hasRichHtml(text: string): boolean {
  return splitRich(text).some((segment) => segment.kind === 'html');
}

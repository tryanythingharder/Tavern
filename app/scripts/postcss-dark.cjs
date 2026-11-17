// PostCSS 插件：深色模式。把样式表里的颜色字面量改写成 light-dark(亮色, 深色)，
// 深色值按 OKLab 明度自动映射（浅底→墨底、深字→浅字、强调色提亮）。
// 生效条件：<html> 的 color-scheme（styles/themes/dark.css 里 html[data-scheme="dark"] 设为 dark）。
// 原样式的层叠顺序与特异度完全不变；手调令牌与例外写在 dark.css（带 data-scheme 的规则不会被改写）。
// 在 postcss.config.mjs 里注册；只处理本项目 app/ 与 styles/ 下的样式。
'use strict';
const path = require('node:path');

const SKIP_SEL = /p-cinema|data-view="?cinema|data-scheme|prefers-color-scheme/;
const COLOR_PROPS = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|border-block(-start|-end)?(-color)?|border-inline(-start|-end)?(-color)?|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|text-decoration(-color)?|column-rule(-color)?|accent-color|-webkit-text-fill-color|--.*)$/;

// ---------- 颜色工具 ----------
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
function rgb2oklab([r, g, b]) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklab2rgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707623483 * s)];
}
function parse(tok) {
  const t = tok.toLowerCase();
  if (NAMED[t]) return NAMED[t];
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const m = t.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.some((p) => p.startsWith('var'))) return null;
  const num = (p, i) => (p.endsWith('%') ? (parseFloat(p) / 100) * (i < 3 ? 255 : 1) : parseFloat(p));
  return [num(parts[0], 0), num(parts[1], 1), num(parts[2], 2), parts[3] !== undefined ? num(parts[3], 3) : 1];
}
const hex = (n) => n.toString(16).padStart(2, '0');
function fmt([r, g, b], a) {
  if (a >= 0.999) return `#${hex(r)}${hex(g)}${hex(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
}
function lerp(points, x) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]; const [x1, y1] = points[i + 1];
    if ((x <= x0 && x >= x1) || (x >= x0 && x <= x1)) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[x > points[0][0] ? 0 : points.length - 1][1];
}
// 明度映射（x 从亮到暗）
const BG = [[1, 0.235], [0.985, 0.205], [0.97, 0.185], [0.945, 0.16], [0.9, 0.27], [0.75, 0.42], [0.5, 0.62], [0.3, 0.8], [0.15, 0.9], [0, 0.95]];
const FG = [[1, 0.2], [0.9, 0.3], [0.75, 0.48], [0.62, 0.62], [0.52, 0.7], [0.42, 0.77], [0.3, 0.86], [0.18, 0.93], [0, 0.96]];
const LINE = [[1, 0.24], [0.94, 0.3], [0.9, 0.34], [0.8, 0.42], [0.6, 0.58], [0.3, 0.8], [0, 0.92]];

function kindOf(prop) {
  if (/shadow/.test(prop)) return 'shadow';
  if (/^(color|fill|caret-color|-webkit-text-fill-color|text-decoration)/.test(prop)) return 'fg';
  if (/^(border|outline|column-rule|stroke)/.test(prop)) return 'line';
  if (prop.startsWith('--')) {
    if (/shadow/.test(prop)) return 'shadow';
    if (/(ink|text|copy|muted|fg|focus|sub|faint|meta|dim|accent(?!-soft)|link|say|act|think|placeholder|g9|g8|g7|g6)/.test(prop) && !/(bg|soft|surface|paper|card)/.test(prop)) return 'fg';
    if (/(line|border|rule|stroke|divider|hair)/.test(prop)) return 'line';
    return 'bg';
  }
  return 'bg';
}

function mapColor(c, kind) {
  const [r, g, b, a] = c;
  const [L, A, B] = rgb2oklab([r, g, b]);
  const C = Math.hypot(A, B);
  if (kind === 'shadow') {
    if (L < 0.5) return fmt([0, 0, 0], Math.min(1, a * 1.6 + 0.05));
    return fmt([255, 255, 255], a * 0.06);
  }
  // 遮罩：半透明黑底保持黑
  if (a < 0.999 && L < 0.3 && C < 0.04) {
    // 半透明黑：浅的是悬停/分隔色调 → 换成半透明白；深的是压图遮罩 → 保持
    if (kind === 'bg' && a >= 0.2) return fmt([r, g, b], a);
    return fmt([255, 255, 255], Math.min(0.16, a * 1.1));
  }
  // 实心深色底（墨色按钮、压图卡片）：深色下保持深色，只略微抬亮以区分层级；上面的白字不用动
  if (kind === 'bg' && C < 0.04 && L < 0.3) return fmt(oklab2rgb([0.3 + L * 0.15, A, B]), a);
  let L2; let k = 1;
  if (C < 0.04 && kind === 'line' && L > 0.985) {
    // 亮色下的白边框本来就是「隐形」的，深色下也贴着卡片色
    L2 = lerp(BG, L);
  } else if (C < 0.04) {
    L2 = lerp(kind === 'fg' ? FG : kind === 'line' ? LINE : BG, L);
  } else if (L > 0.86) {
    // 浅色调（强调色浅底、气泡）→ 深色调
    L2 = kind === 'fg' ? 0.85 : 0.27; k = kind === 'fg' ? 0.8 : Math.min(1, 0.06 / C + 0.35);
  } else if (L < 0.4) {
    L2 = kind === 'bg' ? 0.32 : 0.8; k = 0.9;
  } else {
    // 中明度彩色（强调色、状态色）：深底上要够亮
    L2 = Math.max(L, kind === 'bg' ? 0.6 : 0.7); k = 0.95;
  }
  return fmt(oklab2rgb([L2, A * k, B * k]), a);
}

// ---------- 反向：夜幕写的是深色原样，浅色（白天）由此生成 ----------
const NBG = [[0, 0.965], [0.14, 0.975], [0.165, 0.988], [0.19, 1], [0.235, 0.958], [0.27, 0.935], [0.34, 0.885], [0.5, 0.76], [0.7, 0.52], [1, 0.26]];
const NFG = [[1, 0.17], [0.96, 0.21], [0.84, 0.37], [0.77, 0.43], [0.64, 0.5], [0.45, 0.66], [0.2, 0.9], [0, 0.96]];
const NLINE = [[0, 0.95], [0.2, 0.93], [0.27, 0.9], [0.34, 0.84], [0.6, 0.62], [1, 0.3]];
function mapLight(c, kind) {
  const [r, g, b, a] = c;
  const [L, A, B] = rgb2oklab([r, g, b]);
  const C = Math.hypot(A, B);
  if (kind === 'shadow') {
    if (C >= 0.04) return fmt(oklab2rgb([Math.min(L, 0.56), A, B]), a * 0.5);
    if (L < 0.5) return fmt([24, 22, 20], Math.min(0.18, a * 0.32));
    return fmt([0, 0, 0], a * 0.4);
  }
  if (a < 0.999 && C < 0.04) {
    if (L > 0.8) return fmt(kind === 'fg' ? [27, 27, 29] : [0, 0, 0], kind === 'fg' ? a : Math.min(0.12, a * 0.75)); // 半透明白：悬停/分隔 → 半透明黑
    if (Math.max(r, g, b) <= 6 && kind === 'bg') return a >= 0.45 ? fmt([r, g, b], a) : fmt([0, 0, 0], Math.min(0.05, a * 0.15)); // 纯黑：深遮罩保持，浅的（输入框/胶囊底）→ 极淡灰
    if (kind === 'line') return fmt([0, 0, 0], Math.min(0.14, a * 0.5));
    return fmt(oklab2rgb([lerp(NBG, L), 0, 0]), a); // 半透明暗玻璃 → 半透明白玻璃
  }
  if (C < 0.04) return fmt(oklab2rgb([lerp(kind === 'fg' ? NFG : kind === 'line' ? NLINE : NBG, L), A * 0.5, B * 0.5]), a);
  // 彩色
  let L2; let k = 1;
  if (L < 0.4) { L2 = kind === 'fg' ? 0.42 : 0.955; k = kind === 'fg' ? 1 : Math.min(1, 0.035 / C + 0.25); }
  else if (L > 0.86) { L2 = kind === 'fg' ? 0.42 : 0.94; k = kind === 'fg' ? 1 : 0.5; }
  else { L2 = Math.min(L, kind === 'bg' ? 0.58 : 0.53); k = 1; }
  return fmt(oklab2rgb([L2, A * k, B * k]), a < 0.999 ? a * 0.8 : a);
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

function rewrite(value, prop, ctx) {
  if (/light-dark\(/.test(value)) return null;
  if (/url\(/.test(value) && !/gradient/.test(value)) return null;
  const kind = kindOf(prop);
  if (ctx.reverse) {
    if (/^--(on-|noc-serif|noc-sans|noc-latin)/.test(prop)) return null;
    if (kind === 'fg' && (ctx.overImage || ctx.inkBg)) return null; // 压在图片/彩色按钮上的字照旧
    let ch = false;
    const o = value.replace(COLOR_RE, (tok) => {
      const c = parse(tok);
      if (!c) return tok;
      const lt = mapLight(c, kind);
      if (lt.toLowerCase() === tok.toLowerCase()) return tok;
      ch = true;
      return `light-dark(${lt}, ${tok})`;
    });
    return ch ? o : null;
  }
  if (kind === 'fg' && !prop.startsWith('--')) {
    const c0 = parse((value.match(COLOR_RE) || [''])[0]);
    if (c0 && c0[0] > 235 && c0[1] > 235 && c0[2] > 235 && !ctx.inkBg) return null; // 白字只会出现在深色/彩色/图片上，深色下照旧
  }
  let changed = false;
  const out = value.replace(COLOR_RE, (tok) => {
    const c = parse(tok);
    if (!c) return tok;
    const dark = mapColor(c, kind);
    if (dark.toLowerCase() === tok.toLowerCase()) return tok;
    changed = true;
    return `light-dark(${tok}, ${dark})`;
  });
  return changed ? out : null;
}

// 底色是实心彩色（强调色按钮等）：深色下它会被提亮，白字需换成深字
function solidChromatic(value) {
  if (/gradient|url\(/.test(value)) return false;
  const tok = (value.match(COLOR_RE) || [])[0];
  const c = tok && parse(tok);
  if (!c || c[3] < 0.9) return false;
  const [L, A, B] = rgb2oklab(c);
  return Math.hypot(A, B) >= 0.04 && L >= 0.4 && L <= 0.86;
}

const ROOTS = ['app', 'styles'].map((d) => path.resolve(__dirname, '..', d) + path.sep);

module.exports = () => ({
  postcssPlugin: 'tavern-dark',
  Once(root) {
    const file = root.source && root.source.input && root.source.input.file;
    if (!file || !ROOTS.some((r) => file.startsWith(r))) return;
    root.walkRules((rule) => {
      if (rule.parent && rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
      if (SKIP_SEL.test(rule.selector.replace(/:not\([^()]*\)/g, '')) || /data-scheme/.test(rule.selector)) return;
      for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) if (/prefers-color-scheme/.test(p.params)) return;
      const overImage = (rule.nodes || []).some((n) => n.type === 'decl' && /^background/.test(n.prop) && (/url\(/.test(n.value) || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.[3-9]/.test(n.value)));
      // 底色用的是「墨色」令牌（深色下会变浅），上面的白字要跟着变深
      const inkBg = (rule.nodes || []).some((n) => n.type === 'decl' && /^background/.test(n.prop) && /var\(--(?!ink,)[a-z-]*(ink|text|primary|accent(?!-soft)|focus|danger|g9[05]0|g800)\b/.test(n.value) || (n.type === 'decl' && /^background/.test(n.prop) && solidChromatic(n.value)));

      // 夜幕：原样是深色，反向生成浅色
      const reverse = /nocturne\.css$/.test(file) || /data-theme="?nocturne/.test(rule.selector);
      const accentBg = reverse && (rule.nodes || []).some((n) => n.type === 'decl' && /^background/.test(n.prop) && (/var\(--[a-z-]*(accent(?!-soft)|primary|danger)\b/.test(n.value) || solidChromatic(n.value)));
      const overImg = reverse && (rule.nodes || []).some((n) => n.type === 'decl' && /^background/.test(n.prop) && /url\(/.test(n.value));
      rule.each((node) => {
        if (node.type !== 'decl' || !COLOR_PROPS.test(node.prop)) return;
        const v = rewrite(node.value, node.prop, { overImage: reverse ? overImg : overImage, inkBg: reverse ? accentBg : inkBg, reverse });
        if (v) node.value = v;
      });
    });
  },
});
module.exports.postcss = true;
module.exports.mapColor = mapColor;
module.exports.mapLight = mapLight;
module.exports.parse = parse;

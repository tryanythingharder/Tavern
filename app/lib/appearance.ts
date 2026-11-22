// 用户自定义外观：只存「与默认不同」的字段，JSON → URL 编码后放进 cookie tavern_appearance。
// 服务端在首屏就把它变成 body 上的 data-u-* 属性 + --u-* 变量（不闪屏）；客户端改动时实时套用并回写 cookie。
// 这里是纯函数，服务端与客户端共用。所有输入都经过白名单 / 区间 / 正则校验，绝不把原始字符串写进样式。

export const APPEARANCE_COOKIE = 'tavern_appearance';

export type FontChoice = 'theme' | 'serif' | 'sans' | 'kai' | 'fangsong' | 'mono';
export type Tri = 'theme' | 'on' | 'off';
export type ChatWidth = 'theme' | 'narrow' | 'standard' | 'wide' | 'full';
export type ParaSpacing = 'theme' | 'tight' | 'normal' | 'loose';
export type MsgStyle = 'theme' | 'bubble' | 'flat';
export type Tint = 'none' | 'paper' | 'sepia' | 'mist' | 'sage' | 'rose';
export type BorderChoice = 'theme' | 'none' | 'hairline' | 'strong';
export type ShadowChoice = 'theme' | 'none' | 'soft' | 'strong';
export type MotionChoice = 'full' | 'reduced' | 'off';

export type AppearancePrefs = {
  uiFont: FontChoice;
  bodyFont: FontChoice;
  uiScale: number; // 90–120（%）
  chatScale: number | null; // 80–140（%），null = 跟随旧设置/主题
  lineHeight: number | null; // 1.5–2.1
  chatWidth: ChatWidth;
  paraSpacing: ParaSpacing;
  sayColor: string | null; // 对白
  actColor: string | null; // 旁白/动作
  thinkColor: string | null; // 心理
  narrItalic: Tri;
  narrDim: Tri;
  avatars: boolean;
  names: boolean;
  stamps: boolean; // 显示消息时间
  backdrop: boolean; // 对话页用角色立绘做柔化背景
  msgStyle: MsgStyle;
  accent: string | null;
  tint: Tint;
  radius: number | null; // 0 / 4 / 8 / 14 / 22
  border: BorderChoice;
  shadow: ShadowChoice;
  motion: MotionChoice;
};

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  uiFont: 'theme',
  bodyFont: 'theme',
  uiScale: 100,
  chatScale: null,
  lineHeight: null,
  chatWidth: 'theme',
  paraSpacing: 'theme',
  sayColor: null,
  actColor: null,
  thinkColor: null,
  narrItalic: 'theme',
  narrDim: 'theme',
  avatars: true,
  names: true,
  stamps: false,
  backdrop: false,
  msgStyle: 'theme',
  accent: null,
  tint: 'none',
  radius: null,
  border: 'theme',
  shadow: 'theme',
  motion: 'full',
};

// 只用系统字体栈，不加载任何网络字体
export const FONT_STACKS: Record<Exclude<FontChoice, 'theme'>, string> = {
  serif: '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif CN", "SimSun", serif',
  sans: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif',
  kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", "AR PL UKai CN", "TW-Kai", "Noto Serif SC", serif',
  fangsong: '"STFangsong", "FangSong", "仿宋", "Noto Serif SC", serif',
  mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Noto Sans Mono CJK SC", "Noto Sans SC", monospace',
};

export const FONT_OPTIONS: { id: FontChoice; label: string }[] = [
  { id: 'theme', label: '跟随主题' },
  { id: 'serif', label: '宋体' },
  { id: 'sans', label: '黑体' },
  { id: 'kai', label: '楷体' },
  { id: 'fangsong', label: '仿宋' },
  { id: 'mono', label: '等宽' },
];

export const RADIUS_STEPS = [0, 4, 8, 14, 22] as const;
export const RADIUS_LABELS = ['直角', '小', '中', '大', '圆润'];

export const CHAT_WIDTHS: Record<Exclude<ChatWidth, 'theme'>, number> = { narrow: 600, standard: 760, wide: 940, full: 1180 };
export const PARA_SPACING: Record<Exclude<ParaSpacing, 'theme'>, string> = { tight: '.35em', normal: '.8em', loose: '1.4em' };

export const ACCENT_PRESETS: { hex: string; label: string }[] = [
  // 2026-11-16：去掉蓝紫，取自 Awwwards / CSSDA 获奖站的暖色系；色值已压深到白底文字 ≥4.5:1
  { hex: '#c9401f', label: '朱砂（默认）' },
  { hex: '#8c5e4a', label: '摩卡' },
  { hex: '#8c6a1f', label: '鎏金' },
  { hex: '#2f7a74', label: '青瓷' },
  { hex: '#d0457a', label: '胭脂' },
  { hex: '#1f9d6b', label: '青竹' },
];

// 文字颜色预设：亮暗主题上都可读的中明度色
export const TEXT_COLOR_PRESETS: { hex: string; label: string }[] = [
  { hex: '#c9401f', label: '朱砂' },
  { hex: '#c0507a', label: '胭脂' },
  { hex: '#c46a2a', label: '琥珀' },
  { hex: '#2e9a6f', label: '青竹' },
  { hex: '#2f7a74', label: '青瓷' },
  { hex: '#8b8b96', label: '烟灰' },
];

export const TINTS: Record<Exclude<Tint, 'none'>, { label: string; light: string; dark: string; swatch: string }> = {
  paper: { label: '暖纸', light: '#f7f0e2', dark: '#191208', swatch: '#efe4cf' },
  sepia: { label: '旧书', light: '#efe2c8', dark: '#22170a', swatch: '#e2cfa8' },
  mist: { label: '雾蓝', light: '#e9eef7', dark: '#0b1220', swatch: '#d7e0f0' },
  sage: { label: '青苔', light: '#e8f1e8', dark: '#0b170f', swatch: '#d4e6d4' },
  rose: { label: '樱粉', light: '#f8ecee', dark: '#1d0c11', swatch: '#f0d8dd' },
};

const HEX = /^#[0-9a-f]{6}$/i;
const FONTS: FontChoice[] = ['theme', 'serif', 'sans', 'kai', 'fangsong', 'mono'];
const TRI: Tri[] = ['theme', 'on', 'off'];
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const hex = (value: unknown): string | null => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null);
function num(value: unknown, min: number, max: number, step: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(max, Math.max(min, n));
  return Math.round(Math.round(clamped / step) * step * 100) / 100;
}

// 短键 ↔ 字段：cookie 里只放短键，保持很小
const KEYS: Record<keyof AppearancePrefs, string> = {
  uiFont: 'uf', bodyFont: 'bf', uiScale: 'us', chatScale: 'cs', lineHeight: 'lh', chatWidth: 'cw', paraSpacing: 'ps',
  sayColor: 'cd', actColor: 'cn', thinkColor: 'ct', narrItalic: 'ni', narrDim: 'nd', avatars: 'av', names: 'nm', stamps: 'ts', backdrop: 'bd',
  msgStyle: 'ms', accent: 'ac', tint: 'bt', radius: 'r', border: 'b', shadow: 'sh', motion: 'm',
};

export function sanitizeAppearance(raw: unknown): AppearancePrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const get = (key: keyof AppearancePrefs) => (KEYS[key] in src ? src[KEYS[key]] : src[key]);
  const radius = num(get('radius'), 0, 22, 1);
  return {
    uiFont: pick(get('uiFont'), FONTS, 'theme'),
    bodyFont: pick(get('bodyFont'), FONTS, 'theme'),
    uiScale: num(get('uiScale'), 90, 120, 5) ?? 100,
    chatScale: num(get('chatScale'), 80, 140, 5),
    lineHeight: num(get('lineHeight'), 1.5, 2.1, 0.05),
    chatWidth: pick(get('chatWidth'), ['theme', 'narrow', 'standard', 'wide', 'full'] as const, 'theme'),
    paraSpacing: pick(get('paraSpacing'), ['theme', 'tight', 'normal', 'loose'] as const, 'theme'),
    sayColor: hex(get('sayColor')),
    actColor: hex(get('actColor')),
    thinkColor: hex(get('thinkColor')),
    narrItalic: pick(get('narrItalic'), TRI, 'theme'),
    narrDim: pick(get('narrDim'), TRI, 'theme'),
    avatars: get('avatars') !== false && get('avatars') !== 0,
    names: get('names') !== false && get('names') !== 0,
    stamps: get('stamps') === true || get('stamps') === 1,
    backdrop: get('backdrop') === true || get('backdrop') === 1,
    msgStyle: pick(get('msgStyle'), ['theme', 'bubble', 'flat'] as const, 'theme'),
    accent: hex(get('accent')),
    tint: pick(get('tint'), ['none', 'paper', 'sepia', 'mist', 'sage', 'rose'] as const, 'none'),
    radius: radius === null ? null : RADIUS_STEPS.reduce((best, step) => (Math.abs(step - radius) < Math.abs(best - radius) ? step : best), 0 as number),
    border: pick(get('border'), ['theme', 'none', 'hairline', 'strong'] as const, 'theme'),
    shadow: pick(get('shadow'), ['theme', 'none', 'soft', 'strong'] as const, 'theme'),
    motion: pick(get('motion'), ['full', 'reduced', 'off'] as const, 'full'),
  };
}

export function parseAppearanceCookie(value: string | undefined | null): AppearancePrefs {
  if (!value || value.length > 2048) return { ...DEFAULT_APPEARANCE };
  try {
    return sanitizeAppearance(JSON.parse(decodeURIComponent(value)));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

// 只序列化与默认不同的字段；全默认时返回空串（=删 cookie）
export function serializeAppearance(prefs: AppearancePrefs): string {
  const out: Record<string, unknown> = {};
  (Object.keys(DEFAULT_APPEARANCE) as (keyof AppearancePrefs)[]).forEach((key) => {
    if (prefs[key] !== DEFAULT_APPEARANCE[key]) out[KEYS[key]] = prefs[key];
  });
  return Object.keys(out).length ? encodeURIComponent(JSON.stringify(out)) : '';
}

export function isDefaultAppearance(prefs: AppearancePrefs): boolean {
  return serializeAppearance(prefs) === '';
}

// 把偏好变成 body 上的 data 属性和 CSS 变量。只有用户改过的项才会出现，默认时两者都为空。
export function appearanceBodyProps(prefs: AppearancePrefs): { data: Record<string, string>; vars: Record<string, string> } {
  const p = sanitizeAppearance(Object.fromEntries((Object.keys(prefs) as (keyof AppearancePrefs)[]).map((k) => [k, prefs[k]])));
  const data: Record<string, string> = {};
  const vars: Record<string, string> = {};
  if (p.uiFont !== 'theme') { data['data-u-uifont'] = p.uiFont; vars['--u-font-ui'] = FONT_STACKS[p.uiFont]; }
  if (p.bodyFont !== 'theme') { data['data-u-bodyfont'] = p.bodyFont; vars['--u-font-body'] = FONT_STACKS[p.bodyFont]; }
  if (p.uiScale !== 100) { data['data-u-scale'] = String(p.uiScale); vars['--u-ui-scale'] = String(p.uiScale / 100); }
  if (p.chatScale !== null) { data['data-u-cs'] = String(p.chatScale); vars['--u-chat-scale'] = String(p.chatScale / 100); }
  if (p.lineHeight !== null) { data['data-u-lh'] = ''; vars['--u-lh'] = String(p.lineHeight); }
  if (p.chatWidth !== 'theme') { data['data-u-cw'] = p.chatWidth; vars['--u-cw'] = `${CHAT_WIDTHS[p.chatWidth]}px`; }
  if (p.paraSpacing !== 'theme') { data['data-u-ps'] = p.paraSpacing; vars['--u-ps'] = PARA_SPACING[p.paraSpacing]; }
  if (p.sayColor) { data['data-u-say'] = ''; vars['--u-c-say'] = p.sayColor; }
  if (p.actColor) { data['data-u-act'] = ''; vars['--u-c-act'] = p.actColor; }
  if (p.thinkColor) { data['data-u-think'] = ''; vars['--u-c-think'] = p.thinkColor; }
  if (p.narrItalic !== 'theme') data['data-u-ni'] = p.narrItalic;
  if (p.narrDim !== 'theme') data['data-u-nd'] = p.narrDim;
  if (!p.avatars) data['data-u-noavatar'] = '';
  if (!p.names) data['data-u-noname'] = '';
  if (p.stamps) data['data-u-stamps'] = '';
  if (p.backdrop) data['data-u-backdrop'] = '';
  if (p.msgStyle !== 'theme') data['data-u-ms'] = p.msgStyle;
  if (p.accent) { data['data-u-accent'] = ''; vars['--u-accent'] = p.accent; }
  if (p.tint !== 'none') {
    data['data-u-tint'] = p.tint;
    vars['--u-tint-light'] = TINTS[p.tint].light;
    vars['--u-tint-dark'] = TINTS[p.tint].dark;
  }
  if (p.radius !== null) {
    data['data-u-radius'] = String(p.radius);
    vars['--u-r'] = `${p.radius}px`;
    vars['--u-r-ctl'] = p.radius >= 22 ? '999px' : `${p.radius}px`;
    vars['--u-r-lg'] = `${Math.round(p.radius * 1.25)}px`;
  }
  if (p.border !== 'theme') data['data-u-border'] = p.border;
  if (p.shadow !== 'theme') data['data-u-shadow'] = p.shadow;
  if (p.motion !== 'full') data['data-u-motion'] = p.motion;
  return { data, vars };
}

export const SECTION_KEYS: Record<string, (keyof AppearancePrefs)[]> = {
  font: ['uiFont', 'bodyFont'],
  size: ['uiScale', 'chatScale', 'lineHeight', 'chatWidth', 'paraSpacing'],
  text: ['sayColor', 'actColor', 'thinkColor', 'narrItalic', 'narrDim', 'avatars', 'names', 'stamps', 'backdrop', 'msgStyle'],
  color: ['accent', 'tint'],
  shape: ['radius', 'border', 'shadow'],
  motion: ['motion'],
};

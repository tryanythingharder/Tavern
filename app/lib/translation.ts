// 消息翻译的存储（纯函数，chat-view / db 共用）。对应 ST Translate 扩展的 extra.display_text。
// messages.translations = { "<正文哈希>": { lang, text, original? } }，按正文哈希存：
//   编辑、切换候选后正文变了，旧译文自然对不上，不会显示错的译文；切回来又能复用。
// original=true：玩家开了「翻译输入」，正文是发给模型的译文，text 是玩家原本写的话。
export type TranslationEntry = { lang: string; text: string; original?: boolean; at: number };
export type TranslationView = { lang: string; text: string; original: boolean };

const MAX_ENTRIES = 12;

export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ':' + text.length.toString(36);
}

export function parseTranslations(raw: string | null | undefined): Record<string, TranslationEntry> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function translationFor(raw: string | null | undefined, content: string): TranslationView | null {
  const entry = parseTranslations(raw)[contentHash(content)];
  if (!entry || typeof entry.text !== 'string' || !entry.text) return null;
  return { lang: String(entry.lang || ''), text: entry.text, original: entry.original === true };
}

export function withTranslation(raw: string | null | undefined, content: string, entry: TranslationEntry | null): string | null {
  const map = parseTranslations(raw);
  const key = contentHash(content);
  if (entry) map[key] = { lang: entry.lang.slice(0, 20), text: entry.text.slice(0, 40_000), at: entry.at, ...(entry.original ? { original: true } : {}) };
  else delete map[key];
  const keys = Object.keys(map).sort((a, b) => (map[b].at || 0) - (map[a].at || 0)).slice(0, MAX_ENTRIES);
  const next = Object.fromEntries(keys.map((k) => [k, map[k]]));
  return keys.length ? JSON.stringify(next) : null;
}

// 目标语言（ST 的 target_language）；code 用于存储，label 给界面和翻译提示词
export const TRANSLATE_LANGS: { code: string; label: string; prompt: string }[] = [
  { code: 'zh-CN', label: '简体中文', prompt: 'Simplified Chinese' },
  { code: 'zh-TW', label: '繁體中文', prompt: 'Traditional Chinese' },
  { code: 'en', label: 'English', prompt: 'English' },
  { code: 'ja', label: '日本語', prompt: 'Japanese' },
  { code: 'ko', label: '한국어', prompt: 'Korean' },
  { code: 'es', label: 'Español', prompt: 'Spanish' },
  { code: 'fr', label: 'Français', prompt: 'French' },
  { code: 'de', label: 'Deutsch', prompt: 'German' },
  { code: 'ru', label: 'Русский', prompt: 'Russian' },
  { code: 'pt', label: 'Português', prompt: 'Portuguese' },
  { code: 'vi', label: 'Tiếng Việt', prompt: 'Vietnamese' },
  { code: 'th', label: 'ไทย', prompt: 'Thai' },
  { code: 'id', label: 'Bahasa Indonesia', prompt: 'Indonesian' },
];

export function langLabel(code: string): string {
  return TRANSLATE_LANGS.find((item) => item.code === code)?.label ?? code;
}

// ST 的 auto_mode：none / responses（自动翻译回复）/ inputs（自动翻译输入）/ both
export type TranslateAuto = 'none' | 'responses' | 'inputs' | 'both';
export type TranslatePrefs = { target: string; auto: TranslateAuto; modelLang: string };
export const DEFAULT_TRANSLATE_PREFS: TranslatePrefs = { target: 'zh-CN', auto: 'none', modelLang: 'en' };

export function normalizeTranslatePrefs(raw: unknown): TranslatePrefs {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const valid = (code: unknown, fallback: string) => (typeof code === 'string' && TRANSLATE_LANGS.some((item) => item.code === code) ? code : fallback);
  const auto = ['none', 'responses', 'inputs', 'both'].includes(input.auto as string) ? (input.auto as TranslateAuto) : DEFAULT_TRANSLATE_PREFS.auto;
  return { target: valid(input.target, DEFAULT_TRANSLATE_PREFS.target), auto, modelLang: valid(input.modelLang, DEFAULT_TRANSLATE_PREFS.modelLang) };
}

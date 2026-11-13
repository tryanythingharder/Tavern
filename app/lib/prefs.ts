import db from '@/lib/db';

// 用户偏好：18+ 内容过滤（默认展示，用户可以在「我的」里关掉）
export function hideNsfw(userId: number | null): boolean {
  if (!userId) return false;
  const row = db.prepare('SELECT hide_nsfw FROM users WHERE id = ?').get(userId) as { hide_nsfw: number } | undefined;
  return row?.hide_nsfw === 1;
}

export function setHideNsfw(userId: number, value: boolean): void {
  db.prepare('UPDATE users SET hide_nsfw = ? WHERE id = ?').run(value ? 1 : 0, userId);
}

// 聊天外观：只影响自己的阅读体验（对话字号 85–120%，背景默认/暖灰）
export type ChatBackground = 'default' | 'warm';
export type Appearance = { fontScale: number; background: ChatBackground };

export function getAppearance(userId: number | null): Appearance {
  if (!userId) return { fontScale: 100, background: 'default' };
  const row = db.prepare('SELECT chat_font, chat_bg FROM users WHERE id = ?').get(userId) as { chat_font: number | null; chat_bg: string | null } | undefined;
  const scale = Number(row?.chat_font);
  return {
    fontScale: Number.isFinite(scale) && scale >= 85 && scale <= 120 ? scale : 100,
    background: row?.chat_bg === 'warm' ? 'warm' : 'default',
  };
}

export function setAppearance(userId: number, patch: { fontScale?: number; background?: ChatBackground }): Appearance {
  if (typeof patch.fontScale === 'number') {
    const scale = Math.min(120, Math.max(85, Math.round(patch.fontScale / 5) * 5));
    db.prepare('UPDATE users SET chat_font = ? WHERE id = ?').run(scale, userId);
  }
  if (patch.background === 'default' || patch.background === 'warm') {
    db.prepare('UPDATE users SET chat_bg = ? WHERE id = ?').run(patch.background, userId);
  }
  return getAppearance(userId);
}

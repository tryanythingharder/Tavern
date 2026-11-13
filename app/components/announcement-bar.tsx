'use client';

// 原型顶栏下的社区提醒条；文案由后台「公告」配置。
// 首帧直接渲染占位，是否关闭由 layout 的内联脚本加 body.announcement-off 决定，避免 CLS。
const KEY = 'tavern-announcement-dismissed';

export function AnnouncementBar({ text }: { text: string }) {
  if (!text.trim()) return null;

  return (
    <div className="p-announcement" role="status">
      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v.01M11 12h1v4h1" /></svg>
      <span>{text}</span>
      <button
        type="button"
        aria-label="关闭提醒"
        onClick={() => {
          document.body.classList.add('announcement-off');
          try { localStorage.setItem(KEY, '1'); } catch { /* 忽略 */ }
        }}
      >
        ✕
      </button>
    </div>
  );
}

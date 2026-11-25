// 弹窗打开时锁住背后页面的滚动。html 设了 overflow-x: hidden 时，它本身就是滚动容器，
// 只锁 body 不生效，所以 html 和 body 一起锁；用计数支持弹窗叠弹窗，并补上滚动条宽度避免页面横跳。
let locks = 0;
let saved: { html: string; body: string; pad: string } | null = null;

export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  const html = document.documentElement;
  const body = document.body;
  if (locks === 0) {
    saved = { html: html.style.overflow, body: body.style.overflow, pad: body.style.paddingRight };
    const gutter = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      html.style.overflow = saved.html;
      body.style.overflow = saved.body;
      body.style.paddingRight = saved.pad;
      saved = null;
    }
  };
}

import en from '@/lib/i18n/en.json';

// 英文界面词典：作为 beforeInteractive 脚本在 hydration 前加载，浏览器长期缓存（地址带版本号）
const body = `window.__TAVERN_I18N=${JSON.stringify(en).replace(/</g, '\\u003c')};`;

export function GET() {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

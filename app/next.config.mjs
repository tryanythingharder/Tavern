import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
/** @type {import('next').NextConfig} */
// 开发模式下 React/Next 需要 eval 才能做调试与热更新；生产仍然禁止
const isDev = process.env.NODE_ENV !== 'production';
const httpsSite = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      // 卡里的插图/立绘多在外链图床（画廊、单行 Markdown 图片在主页面里显示），只放行 https
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
      ...(httpsSite ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
  ...(httpsSite ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const sandboxHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'none'",
      "img-src * data: blob:",
      "media-src * data: blob:",
      "font-src * data:",
      "style-src * 'unsafe-inline'",
      "script-src * 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "base-uri *",
    ].join('; '),
  },
];

// 内置卡原图长缓存：只给 public/characters/ 里真实存在的全年龄立绘，且只在地址带 ?v=（lib/cover-url.ts 的 ART_VERSION）时。
// 不能用 /characters/:file 通配：headers() 也会作用在 18+ 原图路由（app/characters/[file]/route.ts）的响应上，
// 把它的 403 / private, no-cache, Vary: Cookie 覆盖成公开长缓存。18+ 立绘在 private/characters/，不在这份名单里；
// 同名文件若两边都有（不该出现）也排除。名单在构建时生成，新增立绘需重新构建。
const publicArt = (() => {
  const dir = (rel) => { try { return fs.readdirSync(fileURLToPath(new URL(rel, import.meta.url))); } catch { return []; } };
  const adult = new Set(dir('./private/characters/'));
  return dir('./public/characters/').filter((file) => /^[a-z0-9-]+\.jpg$/.test(file) && !adult.has(file)).sort();
})();
const publicArtHeaders = publicArt.length
  ? [{
      source: `/characters/:file(${publicArt.map((file) => file.replace(/\.jpg$/, '')).join('|')})\\.jpg`,
      has: [{ type: 'query', key: 'v' }],
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }]
  : [];

const nextConfig = {
  // 锁定项目根目录：服务器上层目录若有别的 lockfile，Next 会猜错根目录，standalone 产物缺文件
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  // EJS 沙盒（lib/ejs.ts）：QuickJS 的 WASM 加载方式不适合被打包，按原样从 node_modules 载入
  serverExternalPackages: ['quickjs-emscripten', 'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
  async headers() {
    return [
      { source: '/((?!sandbox/).*)', headers: securityHeaders },
      // 角色卡 HTML 沙盒：被本站以 sandbox iframe 嵌入；允许外链图片/样式/字体/脚本（状态图、美化常用 CDN），禁止网络请求外发
      { source: '/sandbox/:path*', headers: sandboxHeaders },
      // 预构建样式（scripts/build-css.mjs）文件名带内容 hash，可长期缓存
      { source: '/_css/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // 全年龄内置立绘原图（地址带 ?v=），见上面 publicArt
      ...publicArtHeaders,
      // Service Worker 必须每次重新校验，否则新版本发不出去
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;

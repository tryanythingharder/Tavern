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

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // EJS 沙盒（lib/ejs.ts）：QuickJS 的 WASM 加载方式不适合被打包，按原样从 node_modules 载入
  serverExternalPackages: ['quickjs-emscripten', 'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
  async headers() {
    return [
      { source: '/((?!sandbox/).*)', headers: securityHeaders },
      // 角色卡 HTML 沙盒：被本站以 sandbox iframe 嵌入；允许外链图片/样式/字体/脚本（状态图、美化常用 CDN），禁止网络请求外发
      { source: '/sandbox/:path*', headers: sandboxHeaders },
      // Service Worker 必须每次重新校验，否则新版本发不出去
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;

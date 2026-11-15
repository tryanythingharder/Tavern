// 酒馆 Service Worker：只做两件事，不缓存任何接口和登录态页面内容。
// 1) /_next/static 与 /icons 这类带哈希/不变的静态资源：缓存优先，二次打开更快。
// 2) 页面导航断网时：返回离线页 /offline.html，而不是浏览器的恐龙页。
const VERSION = 'tavern-v1';
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(STATIC).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});

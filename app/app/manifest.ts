import type { MetadataRoute } from 'next';

// PWA：可「添加到主屏幕」，独立窗口打开。图标在 public/icons，由 app/icon.svg 同款字形生成。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '夜话 · 角色扮演',
    short_name: '夜话',
    description: '和喜欢的角色开始一段故事。',
    lang: 'zh-CN',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f7f8',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '继续对话', url: '/chats', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: '发现角色', url: '/plaza', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

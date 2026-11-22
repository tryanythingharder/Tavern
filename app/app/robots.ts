import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

// 只开放公开展示页；账号、对话、后台、接口一律不收录
export default function robots(): MetadataRoute.Robots {
  const production = process.env.NODE_ENV === 'production' && !/localhost|127\.0\.0\.1/.test(siteUrl());
  if (!production || process.env.TAVERN_NOINDEX === '1') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/plaza', '/c/', '/a/', '/models', '/terms', '/privacy', '/guidelines', '/support'],
      disallow: ['/api/', '/admin', '/me', '/chats', '/rooms', '/create', '/library', '/notifications', '/search', '/login/', '/verify', '/verify-email', '/reset', '/forgot', '/logout', '/media/', '/i/', '/register'],
    }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}

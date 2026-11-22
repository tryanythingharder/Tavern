import type { MetadataRoute } from 'next';
import { listCharacterViews } from '@/lib/characters';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

// 公开角色（18+ 不进站点地图）+ 作者页 + 静态页
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  const chars = listCharacterViews(undefined, { hideNsfw: true });
  const authors = new Map<string, number>();
  for (const c of chars) authors.set(c.author, Math.max(authors.get(c.author) ?? 0, c.createdAt || 0));
  const stat = (path: string, priority: number, changeFrequency: 'daily' | 'weekly' | 'monthly' = 'weekly') => ({ url: base + path, lastModified: now, changeFrequency, priority });
  return [
    stat('/', 1, 'daily'),
    stat('/plaza', 0.9, 'daily'),
    stat('/models', 0.5),
    stat('/guidelines', 0.3, 'monthly'),
    stat('/terms', 0.2, 'monthly'),
    stat('/privacy', 0.2, 'monthly'),
    ...chars.map((c) => ({ url: `${base}/c/${encodeURIComponent(c.id)}`, lastModified: c.createdAt ? new Date(c.createdAt) : now, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...[...authors].map(([name, t]) => ({ url: `${base}/a/${encodeURIComponent(name)}`, lastModified: t ? new Date(t) : now, changeFrequency: 'weekly' as const, priority: 0.4 })),
  ];
}

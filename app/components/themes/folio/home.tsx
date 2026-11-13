import { HomeClassic } from '@/components/home-classic';
import type { HomeData } from '@/components/themes/types';

// TODO(folio): 主题专属首页
export function FolioHome({ data }: { data: HomeData }) {
  return <HomeClassic data={data} />;
}

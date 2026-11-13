import { HomeClassic } from '@/components/home-classic';
import type { HomeData } from '@/components/themes/types';

// TODO(nocturne): 主题专属首页
export function NocturneHome({ data }: { data: HomeData }) {
  return <HomeClassic data={data} />;
}

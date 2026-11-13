import { HomeClassic } from '@/components/home-classic';
import type { HomeData } from '@/components/themes/types';

// TODO(stage): 主题专属首页
export function StageHome({ data }: { data: HomeData }) {
  return <HomeClassic data={data} />;
}

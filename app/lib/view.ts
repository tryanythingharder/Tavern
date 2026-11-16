// 旧的「经典 / 影院」开关已被三套主题取代（见 lib/theme.ts）。
// 保留这个接口，旧页面里 view === 'cinema' 的分支不再触发。
export type ViewMode = 'classic' | 'cinema';

export async function getViewMode(): Promise<ViewMode> {
  return 'classic';
}

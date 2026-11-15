// 玩法模式：新手（精简、带引导）/ 老玩家（SillyTavern 全参数、术语对照）。
// 存 cookie（与主题一致，按浏览器生效）。没选过时返回 null，首次进入弹出选择。
export type PlayMode = 'newbie' | 'veteran';
export const PLAY_MODE_COOKIE = 'tavern_mode';
export const PLAY_MODES: { id: PlayMode; label: string; hint: string }[] = [
  { id: 'newbie', label: '新手', hint: '界面精简，随处有提示；预设、正则等进阶功能收起但随时可用' },
  { id: 'veteran', label: '酒馆老玩家', hint: 'SillyTavern 的全部功能直接展开，术语与 ST 对照，参数全开' },
];

export function parsePlayMode(value: string | undefined | null): PlayMode | null {
  return value === 'newbie' || value === 'veteran' ? value : null;
}

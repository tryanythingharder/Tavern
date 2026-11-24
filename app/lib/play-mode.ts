// 玩法模式（注册后首次进入弹指引选择，之后可在「外观」里改）：
//  - newbie：从未玩过。界面干净，只留聊天必需的设置，随处有提示。
//  - simple：酒馆老玩家 · 简单功能。ST 术语对照、预设/世界书/正则都在，采样参数只露常用几项。
//  - full：酒馆老玩家 · 酒馆全功能。全部采样参数、上下文模板、Instruct、对话内直接调参。
// 所有功能在三种模式下都存在（直接访问页面也能用），模式只决定默认展示多少。
// 存 cookie（与主题一致，按浏览器生效）。没选过时返回 null，首次进入弹出选择。
export type PlayMode = 'newbie' | 'simple' | 'full';
export const PLAY_MODE_COOKIE = 'tavern_mode';
export const PLAY_MODES: { id: PlayMode; label: string; hint: string }[] = [
  { id: 'newbie', label: '新手', hint: '界面干净、设置少，边玩边提示；进阶功能先收起来' },
  { id: 'simple', label: '老玩家 · 简单功能', hint: 'ST 术语对照，预设 / 世界书 / 正则都在，参数只露常用几项' },
  { id: 'full', label: '老玩家 · 酒馆全功能', hint: '全部采样参数、上下文模板、Instruct 展开，对话里直接调参' },
];

export function parsePlayMode(value: string | undefined | null): PlayMode | null {
  if (value === 'newbie' || value === 'simple' || value === 'full') return value;
  if (value === 'veteran') return 'full'; // 旧版「老玩家」cookie
  return null;
}

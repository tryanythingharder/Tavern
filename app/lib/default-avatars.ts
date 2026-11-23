// 默认头像：夜话自绘的孔版印刷风预设（public/avatars/<id>.webp）。
// 没上传头像的人可以直接选；新注册用户随机分一个。新增一张图 = 放文件 + 在这里加一行。
export const DEFAULT_AVATARS = [
  { id: 'moon', label: '弦月' }, { id: 'lantern', label: '灯笼' }, { id: 'tea', label: '清茶' }, { id: 'cat', label: '睡猫' },
  { id: 'fox', label: '狐狸' }, { id: 'letter', label: '信笺' }, { id: 'candle', label: '烛火' }, { id: 'ghost', label: '小鬼' },
  { id: 'sakura', label: '樱花' }, { id: 'owl', label: '猫头鹰' }, { id: 'rabbit', label: '兔子' }, { id: 'koi', label: '锦鲤' },
  { id: 'crane', label: '纸鹤' }, { id: 'deer', label: '小鹿' }, { id: 'crow', label: '乌鸦' }, { id: 'mushroom', label: '蘑菇' },
  { id: 'umbrella', label: '纸伞' }, { id: 'book', label: '书卷' }, { id: 'quill', label: '羽笔' }, { id: 'key', label: '钥匙' },
  { id: 'mask', label: '面具' }, { id: 'mountain', label: '远山' }, { id: 'sake', label: '清酒' }, { id: 'bonsai', label: '盆景' },
] as const;

export type DefaultAvatarId = (typeof DEFAULT_AVATARS)[number]['id'];

export const defaultAvatarUrl = (id: string) => `/avatars/${id}.webp`;

export function findDefaultAvatar(id: unknown): (typeof DEFAULT_AVATARS)[number] | null {
  return DEFAULT_AVATARS.find((item) => item.id === id) ?? null;
}

export function randomDefaultAvatarUrl(): string {
  const item = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
  return defaultAvatarUrl(item.id);
}

import { getSetting } from '@/lib/settings';

// 玩家端顶部公告：默认显示社区提醒；管理员显式关闭后写 'off'，不再回退到默认文案
export const DEFAULT_ANNOUNCEMENT = '社区提醒：请尊重创作者的公开设定，不要在评论中披露他人的私有提示词。';

export function announcementText(): string {
  const raw = getSetting('site.announcement', '');
  if (raw === 'off') return '';
  return raw || DEFAULT_ANNOUNCEMENT;
}

export function announcementSetting(): string {
  const raw = getSetting('site.announcement', '');
  return raw === 'off' ? '' : raw;
}

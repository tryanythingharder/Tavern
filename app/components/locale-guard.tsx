'use client';

import { useEffect } from 'react';

// 语言是在首屏脚本里定的；登录后账号偏好把语言改了、又是站内跳转时，整页刷新一次换成新语言
export function LocaleGuard({ locale }: { locale: 'zh' | 'en' }) {
  useEffect(() => {
    if ((window.__TAVERN_LANG ?? 'zh') !== locale) window.location.reload();
  }, [locale]);
  return null;
}

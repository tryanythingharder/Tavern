'use client';

import { useEffect, useState } from 'react';
import { tr } from '@/lib/i18n/runtime';

// 邀请页：专属链接 + 邀请码，复制 / 分享
export function InviteLink({ code, bonus }: { code: string; bonus: number }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, []);
  const link = origin ? `${origin}/i/${code}` : `/i/${code}`;
  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* 剪贴板不可用时可以手动选中 */ }
  };
  const share = async () => {
    try {
      await navigator.share({ title: tr('来夜话和角色一起写故事'), text: bonus > 0 ? tr(`用我的链接注册，多得 ${bonus} 点：`) : tr('用我的链接注册：'), url: link });
    } catch { /* 用户取消 */ }
  };
  return (
    <div className="iv-link">
      <label className="iv-link-label" htmlFor="iv-link-input">专属邀请链接</label>
      <div className="iv-link-row">
        <input id="iv-link-input" className="p-input" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        <button className="p-btn p-btn--primary" type="button" onClick={() => void copy('link')}>{copied === 'link' ? '已复制' : '复制链接'}</button>
        {canShare && <button className="p-btn" type="button" onClick={() => void share()}>分享</button>}
      </div>
      <div className="iv-code">
        <span>邀请码</span>
        <b>{code}</b>
        <button className="p-btn p-btn--sm" type="button" onClick={() => void copy('code')}>{copied === 'code' ? '已复制' : '复制'}</button>
      </div>
      <p className="p-small">好友打开链接注册时，邀请码自动锁定为你的，不会被改掉；链接 30 天内有效（同一台设备）。</p>
    </div>
  );
}

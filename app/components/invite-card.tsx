'use client';

import { useEffect, useState } from 'react';

// 「我的 · 点数」里的增长卡：今日免费额度、首充赠送、邀请好友链接。数值由服务端算好传入。
export function GrowthCard(props: {
  dailyFree: number;
  dailyLeft: number;
  firstTopupPct: number;
  firstTopup: boolean;
  inviteReward: number;
  inviteeBonus: number;
  code: string | null;
  joined: number;
  active: number;
}) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = props.code ? `${origin}/login?ref=${props.code}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* 剪贴板不可用时用户可以手动选中复制 */ }
  };
  const showInvite = Boolean(props.code) && (props.inviteReward > 0 || props.inviteeBonus > 0);
  if (!props.dailyFree && !(props.firstTopupPct && props.firstTopup) && !showInvite) return null;

  return (
    <section className="p-card p-card--pad gr-card" aria-label="福利">
      {props.dailyFree > 0 && (
        <div className="gr-row">
          <div>
            <b>今日免费额度</b>
            <p className="p-small">每天 {props.dailyFree} 点，生成时优先抵扣，北京时间零点刷新，不累积。</p>
          </div>
          <div className="gr-meter" role="meter" aria-valuemin={0} aria-valuemax={props.dailyFree} aria-valuenow={props.dailyLeft} aria-label="今日免费额度剩余">
            <span><b>{props.dailyLeft}</b> / {props.dailyFree}</span>
            <i><i style={{ width: `${(props.dailyLeft / props.dailyFree) * 100}%` }} /></i>
          </div>
        </div>
      )}
      {props.firstTopupPct > 0 && props.firstTopup && (
        <div className="gr-row">
          <div>
            <b>首充多送 {props.firstTopupPct}%</b>
            <p className="p-small">第一笔充值到账时，额外赠送充值点数的 {props.firstTopupPct}%。</p>
          </div>
          <span className="gr-tag">限首单</span>
        </div>
      )}
      {showInvite && (
        <div className="gr-row gr-row--invite">
          <div>
            <b>邀请好友</b>
            <p className="p-small">
              {props.inviteeBonus > 0 && <>好友用你的链接注册，额外得 {props.inviteeBonus} 点。</>}
              {props.inviteReward > 0 && <>好友开始第一段故事后，你得 {props.inviteReward} 点。</>}
              {props.joined > 0 && <> 已邀请 {props.joined} 人，{props.active} 人已开聊。</>}
            </p>
          </div>
          <div className="gr-link">
            <input className="p-input" readOnly value={link || `邀请码 ${props.code}`} aria-label="邀请链接" onFocus={(event) => event.currentTarget.select()} />
            <button className="p-btn p-btn--sm p-btn--primary" type="button" onClick={() => void copy()} disabled={!link}>{copied ? '已复制' : '复制链接'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

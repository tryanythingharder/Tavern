'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

type Status = { todayDone: boolean; streak: number; amount: number; day: string };

// 每日签到弹窗：状态由服务端传入，首帧即可判断是否弹出；稍后当天不再弹
export function CheckinPopup({ initial }: { initial: Status }) {
  const router = useRouter();
  // 签到结果显示在 done 里，status 只读首帧传入的值（原来的 setStatus 从没调用过）
  const [status] = useState<Status>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ amount: number; streak: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial.todayDone) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(`tavern-checkin-dismissed-${initial.day}`) === '1'; } catch { /* 忽略 */ }
    if (dismissed) return;
    // 新用户先选玩法模式，选完再弹签到，避免两个弹窗叠在一起
    const hasMode = () => /(?:^|; )tavern_mode=(newbie|simple|full)/.test(document.cookie);
    if (hasMode()) { setOpen(true); return; }
    const onMode = () => window.setTimeout(() => setOpen(true), 400);
    window.addEventListener('tavern-mode-change', onMode, { once: true });
    return () => window.removeEventListener('tavern-mode-change', onMode);
  }, [initial.todayDone, initial.day]);

  const dismiss = () => {
    try { localStorage.setItem(`tavern-checkin-dismissed-${status.day}`, '1'); } catch { /* 忽略 */ }
    setOpen(false);
    router.refresh();
  };

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ amount: number; streak: number }>('/api/checkin', { method: 'POST', body: '{}' });
      setDone(result);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open || status.todayDone) return null;

  return (
    <Modal
      title="每日签到"
      onClose={dismiss}
      footer={
        done ? (
          <button className="btn btn--sm btn--primary" type="button" onClick={dismiss}>收下</button>
        ) : (
          <>
            <button className="btn btn--sm" type="button" disabled={busy} onClick={dismiss}>稍后</button>
            <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => void claim()}>{busy ? '签到中…' : `签到领取 ${status.amount} 点`}</button>
          </>
        )
      }
    >
      <ErrorLine message={error} />
      {done ? (
        <div className="checkin-hero" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div className="p-eyebrow">CHECKED IN</div>
          <p className="checkin-amount" style={{ margin: '10px 0 4px', fontSize: 34, fontWeight: 700, letterSpacing: '-.03em' }}>+{done.amount} 点</p>
          <p className="p-small" style={{ margin: 0 }}>连续签到 {done.streak} 天 · 点数已到账</p>
        </div>
      ) : (
        <>
          <div className="checkin-hero" style={{ textAlign: 'center', padding: '4px 0 12px' }}>
            <div className="p-eyebrow">DAILY CHECK-IN</div>
            <p className="checkin-amount" style={{ margin: '10px 0 4px', fontSize: 34, fontWeight: 700, letterSpacing: '-.03em' }}>{status.amount} 点</p>
            <p className="p-small" style={{ margin: 0 }}>今天签到可领 · 连续第 {status.streak} 天</p>
          </div>
          <div className="checkin-days" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
            {Array.from({ length: 7 }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="checkin-day"
                data-done={index < Math.min(status.streak, 7) ? 'true' : undefined}
                style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700,
                  background: index < Math.min(status.streak, 7) ? 'var(--text)' : 'var(--surface-2)',
                  color: index < Math.min(status.streak, 7) ? 'var(--bg)' : 'var(--muted)',
                }}
              >
                {index + 1}
              </span>
            ))}
          </div>
          <p className="p-hint" style={{ textAlign: 'center', margin: 0 }}>基础 10 点，连续每天 +2，最多 +14。断签从第 1 天重新开始。</p>
        </>
      )}
    </Modal>
  );
}

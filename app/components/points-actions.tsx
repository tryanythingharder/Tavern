'use client';
import { LocalTime } from '@/components/local-time';
import { formatMoney } from '@/lib/money';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type Order = { id: number; points: number; priceCents: number; status: string; createdAt: number };

const STATUS_LABEL: Record<string, string> = { pending: '待支付', paid: '已到账', cancelled: '已取消' };

export function PointsActions({ orders, pricePerPointCents, currency = 'USD' }: { orders: Order[]; pricePerPointCents: number; currency?: string }) {
  const yuan = (cents: number) => formatMoney(cents, currency);
  const router = useRouter();
  const [code, setCode] = useState('');
  const [points, setPoints] = useState('1000');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'redeem' | 'order' | null>(null);

  const redeem = async () => {
    setBusy('redeem');
    setError('');
    setNotice('');
    try {
      const result = await api<{ amount: number; balance: number }>('/api/codes/redeem', { method: 'POST', body: JSON.stringify({ code }) });
      setNotice(`兑换成功，+${result.amount} 点，当前余额 ${result.balance}`);
      setCode('');
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createOrder = async () => {
    setBusy('order');
    setError('');
    setNotice('');
    try {
      const value = Number(points);
      const result = await api<{ payUrl: string | null }>('/api/orders', { method: 'POST', body: JSON.stringify({ points: value }) });
      if (result.payUrl) {
        window.location.href = result.payUrl;
        return;
      }
      setNotice(`已创建订单：${value} 点 / ${yuan(value * pricePerPointCents)}。请联系管理员确认到账。`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const amount = Number(points) || 0;

  return (
    <div style={{ display: 'grid', gap: 16, marginBottom: 20 }}>
      <ErrorLine message={error} />
      {notice && <p className="small" role="status" style={{ margin: 0, color: 'var(--ok, #2e7d43)' }}>{notice}</p>}

      <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
        <h2 className="p-form-section-title">兑换码</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input
            className="p-input"
            style={{ flex: '1 1 220px', textTransform: 'uppercase' }}
            value={code}
            placeholder="TAV-XXXX-XXXX"
            onChange={(event) => setCode(event.target.value)}
            aria-label="兑换码"
          />
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'redeem' || !code.trim()} onClick={() => void redeem()}>
            {busy === 'redeem' ? '兑换中…' : '兑换'}
          </button>
        </div>
      </section>

      <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
        <h2 className="p-form-section-title">充值订单</h2>
        <p className="small" style={{ marginTop: 0 }}>单价：1 点 = {pricePerPointCents} 分。创建订单后联系管理员确认到账（支付网关接入后会自动回调）。</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            className="p-input"
            style={{ width: 120 }}
            type="number"
            min={10}
            max={100000}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            aria-label="充值点数"
          />
          <span className="small">应付 {yuan(amount * pricePerPointCents)}</span>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'order' || amount < 10} onClick={() => void createOrder()}>
            {busy === 'order' ? '创建中…' : '创建订单'}
          </button>
        </div>
      </section>

      {orders.length > 0 && (
        <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
          <h2 className="p-form-section-title">我的订单</h2>
          <div className="res-list">
            {orders.map((order) => (
              <div className="res-row" key={order.id} style={{ padding: '10px 12px' }}>
                <div className="res-row-main">
                  <div className="res-row-title" style={{ fontSize: 13.5 }}>#{order.id} · {order.points} 点 · {yuan(order.priceCents)}</div>
                  <div className="res-row-sub"><LocalTime value={order.createdAt} /></div>
                </div>
                <span className="tag" style={{ height: 22, padding: '0 10px', fontSize: 11 }}>{STATUS_LABEL[order.status] ?? order.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

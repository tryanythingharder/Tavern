'use client';
import { LocalTime } from '@/components/local-time';
import { formatMoney } from '@/lib/money';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { confirmAction, toast } from '@/components/admin-feedback';

type Order = {
  id: number; points: number; priceCents: number; status: string; createdAt: number; paidAt: number | null;
  userId: number; nickname: string; email: string;
};

const STATUS_LABEL: Record<string, string> = { pending: '待支付', paid: '已到账', cancelled: '已取消', refunded: '已退款' };
const STATUS_PILL: Record<string, string> = { pending: 'p-pill--warn', paid: 'p-pill--ok', cancelled: 'p-pill--outline', refunded: 'p-pill--danger' };

function startOfDay(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfMonth(): number {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function AdminBilling({ orders, currency = 'USD' }: { orders: Order[]; currency?: string }) {
  const yuan = (cents: number) => formatMoney(cents, currency);
  const router = useRouter();
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState<number | null>(null);
  const [tab, setTab] = useState<'all' | 'paid' | 'pending' | 'cancelled' | 'refunded'>('all');
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  const pay = async (id: number) => {
    const order = orders.find((item) => item.id === id);
    if (!(await confirmAction({ title: `确认订单 #${id} 已到账？`, message: order ? `会给「${order.nickname}」加 ${order.points.toLocaleString('zh-CN')} 点（首充奖励、邀请返点也会同时发放），并通知玩家。` : '会给玩家加点并通知。', detail: '只在确认收到款后操作；到账后只能走退款撤回。', confirmLabel: '确认到账' }))) return;
    setPayingId(id);
    setError('');
    try {
      await api(`/api/admin/orders/${id}/pay`, { method: 'POST' });
      toast.ok(`订单 #${id} 已确认到账`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setPayingId(null);
    }
  };

  const refund = async (id: number) => {
    setPayingId(id);
    setError('');
    try {
      await api(`/api/admin/orders/${id}/refund`, { method: 'POST' });
      toast.ok(`订单 #${id} 已退款`);
      setConfirmId(null);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setPayingId(null);
    }
  };

  const today = startOfDay();
  const month = startOfMonth();
  const paidToday = orders.filter((order) => order.status === 'paid' && (order.paidAt ?? order.createdAt) >= today);
  const paidMonth = orders.filter((order) => order.status === 'paid' && (order.paidAt ?? order.createdAt) >= month);
  const pending = orders.filter((order) => order.status === 'pending');
  const refunded = orders.filter((order) => order.status === 'refunded');
  const exportCsv = () => {
    const lines = ['订单号,玩家,邮箱,金额,点数,状态,时间'];
    for (const order of visible) {
      lines.push([order.id, order.nickname, order.email, yuan(order.priceCents), order.points, STATUS_LABEL[order.status] ?? order.status, new Date(order.createdAt).toLocaleString('zh-CN')].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const q = query.trim().toLowerCase();
  const visible = orders.filter((order) => {
    if (tab !== 'all' && order.status !== tab) return false;
    if (!q) return true;
    return `${order.id} ${order.nickname} ${order.email}`.toLowerCase().includes(q);
  });

  return (
    <>
      <ErrorLine message={error} />

      <div className="p-kpis" style={{ marginBottom: 20 }}>
        <div className="p-card p-card--pad">
          <div className="p-kpi-label">今日实收</div>
          <div className="p-kpi-value">{yuan(paidToday.reduce((sum, order) => sum + order.priceCents, 0))}</div>
          <div className="p-kpi-delta">{paidToday.length} 笔订单</div>
        </div>
        <div className="p-card p-card--pad">
          <div className="p-kpi-label">待支付</div>
          <div className="p-kpi-value">{pending.length} 笔</div>
          <div className="p-kpi-delta">{yuan(pending.reduce((sum, order) => sum + order.priceCents, 0))}</div>
        </div>
        <div className="p-card p-card--pad">
          <div className="p-kpi-label">本月收入</div>
          <div className="p-kpi-value">{yuan(paidMonth.reduce((sum, order) => sum + order.priceCents, 0))}</div>
          <div className="p-kpi-delta">{paidMonth.length} 笔已到账</div>
        </div>
        <div className="p-card p-card--pad">
          <div className="p-kpi-label">退款</div>
          <div className="p-kpi-value">{refunded.length} 笔</div>
          <div className="p-kpi-delta">{yuan(refunded.reduce((sum, order) => sum + order.priceCents, 0))}</div>
        </div>
      </div>

      <section className="p-card">
        <div className="admin-toolbar">
          <div className="p-tabs" role="tablist" aria-label="订单状态">
            {([['all', '全部'], ['paid', '已到账'], ['pending', '待支付'], ['refunded', '已退款'], ['cancelled', '已取消']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
          <label className="p-search" style={{ marginLeft: 'auto' }}>
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input className="p-input" type="search" value={query} placeholder="订单号或玩家" aria-label="搜索订单" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="p-btn p-btn--sm" type="button" onClick={exportCsv}>导出当前筛选</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>订单号</th><th>玩家</th><th>金额</th><th>点数</th><th>状态</th><th>时间</th><th>操作</th></tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id}>
                  <td data-label="订单号">#{order.id}</td>
                  <td data-label="玩家">{order.nickname}</td>
                  <td data-label="金额">{yuan(order.priceCents)}</td>
                  <td data-label="点数">{order.points.toLocaleString('zh-CN')} 点</td>
                  <td data-label="状态"><span className={`p-pill p-pill--sm ${STATUS_PILL[order.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[order.status] ?? order.status}</span></td>
                  <td data-label="时间" className="small"><LocalTime value={order.createdAt} /></td>
                  <td data-label="操作">
                    <div className="admin-actions">
                      <button className="p-btn p-btn--sm" type="button" onClick={() => setDetail(order)}>详情</button>
                      {order.status === 'pending' && (
                        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={payingId === order.id} onClick={() => void pay(order.id)}>
                          {payingId === order.id ? '确认中…' : '确认到账'}
                        </button>
                      )}
                      {order.status === 'paid' && (confirmId === order.id ? (
                        <>
                          <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={payingId === order.id} onClick={() => void refund(order.id)}>{payingId === order.id ? '退款中…' : '确认退款'}</button>
                          <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(null)}>取消</button>
                        </>
                      ) : (
                        <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(order.id)}>退款</button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={7} className="admin-empty">没有匹配的订单。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <Modal
          title={`订单 #${detail.id}`}
          onClose={() => setDetail(null)}
          footer={<button className="btn btn--sm" type="button" onClick={() => setDetail(null)}>关闭</button>}
        >
          <div className="admin-table-wrap">
            <table className="admin-table">
              <tbody>
                <tr><td>玩家</td><td>{detail.nickname}（{detail.email}）</td></tr>
                <tr><td>点数</td><td>{detail.points.toLocaleString('zh-CN')} 点</td></tr>
                <tr><td>金额</td><td>{yuan(detail.priceCents)}</td></tr>
                <tr><td>状态</td><td>{STATUS_LABEL[detail.status] ?? detail.status}</td></tr>
                <tr><td>创建时间</td><td><LocalTime value={detail.createdAt} /></td></tr>
                <tr><td>到账时间</td><td>{detail.paidAt ? <LocalTime value={detail.paidAt} /> : '—'}</td></tr>
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}

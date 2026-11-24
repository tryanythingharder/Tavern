'use client';
import { LocalTime } from '@/components/local-time';
import { formatMoney } from '@/lib/money';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Modal, api } from '@/components/settings-ui';
import { confirmAction, toast } from '@/components/admin-feedback';
import { AdminEmpty, SortTh } from '@/components/admin-list';

type Order = {
  id: number; points: number; priceCents: number; status: string; createdAt: number; paidAt: number | null;
  userId: number; nickname: string; email: string; provider?: string;
};
type Stat = { n: number; cents: number };
export type OrderStats = { paidToday: Stat; pending: Stat; paidMonth: Stat; refunded: Stat };

const STATUS_LABEL: Record<string, string> = { pending: '待支付', paid: '已到账', cancelled: '已取消', refunded: '已退款' };
const STATUS_PILL: Record<string, string> = { pending: 'p-pill--warn', paid: 'p-pill--ok', cancelled: 'p-pill--outline', refunded: 'p-pill--danger' };

// 订单列表：KPI 用全站口径（stats），筛选/搜索/排序/分页由服务端按 URL 参数完成。
export function AdminBilling({ orders, currency = 'USD', sort, filtered }: {
  orders: Order[]; currency?: string; sort?: { sort: string; dir: 'asc' | 'desc' }; filtered?: boolean;
}) {
  const yuan = (cents: number) => formatMoney(cents, currency);
  const router = useRouter();
  const [rows, setRows] = useState(orders);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);
  useEffect(() => setRows(orders), [orders]);

  const pay = async (order: Order) => {
    if (!(await confirmAction({ title: `确认订单 #${order.id} 已到账？`, message: `会给「${order.nickname}」加 ${order.points.toLocaleString('zh-CN')} 点（首充奖励、邀请返点也会同时发放），并通知玩家。`, detail: '只在确认收到款后操作；到账后只能走退款撤回。', confirmLabel: '确认到账' }))) return;
    setBusyId(order.id);
    try {
      await api(`/api/admin/orders/${order.id}/pay`, { method: 'POST' });
      setRows((prev) => prev.map((item) => (item.id === order.id ? { ...item, status: 'paid', paidAt: Date.now() } : item)));
      toast.ok(`订单 #${order.id} 已确认到账`);
      router.refresh();
    } catch (caught) {
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const refund = async (order: Order) => {
    if (!(await confirmAction({ title: `退款订单 #${order.id}？`, message: `会从「${order.nickname}」的余额扣回 ${order.points.toLocaleString('zh-CN')} 点，订单标记为已退款。实际退钱需要在支付渠道后台操作。`, confirmLabel: '确认退款', danger: true }))) return;
    setBusyId(order.id);
    try {
      await api(`/api/admin/orders/${order.id}/refund`, { method: 'POST' });
      setRows((prev) => prev.map((item) => (item.id === order.id ? { ...item, status: 'refunded' } : item)));
      toast.ok(`订单 #${order.id} 已退款`);
      router.refresh();
    } catch (caught) {
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const lines = ['订单号,玩家,邮箱,金额,点数,状态,时间'];
    for (const order of rows) {
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

  const current = sort ?? { sort: 'id', dir: 'desc' as const };

  return (
    <>
      <div className="a-tablehead">
        <span className="p-small">点玩家名进入玩家详情</span>
        <button className="p-btn p-btn--sm" type="button" onClick={exportCsv}>导出本页 CSV</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table a-cards">
          <thead>
            <tr>
              {sort ? <SortTh k="id" label="订单号" current={current} /> : <th>订单号</th>}
              <th>玩家</th>
              {sort ? <SortTh k="price" label="金额" current={current} /> : <th>金额</th>}
              {sort ? <SortTh k="points" label="点数" current={current} /> : <th>点数</th>}
              <th>状态</th>
              <th>时间</th>
              <th><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id}>
                <td data-label="订单号" className="a-primary"><strong>#{order.id}</strong></td>
                <td data-label="玩家"><Link href={`/admin/users/${order.userId}`}>{order.nickname}</Link></td>
                <td data-label="金额">{yuan(order.priceCents)}</td>
                <td data-label="点数">{order.points.toLocaleString('zh-CN')} 点</td>
                <td data-label="状态"><span className={`p-pill p-pill--sm ${STATUS_PILL[order.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[order.status] ?? order.status}</span></td>
                <td data-label="时间" className="small"><LocalTime value={order.createdAt} /></td>
                <td data-label="操作">
                  <div className="admin-actions">
                    <button className="p-btn p-btn--sm" type="button" onClick={() => setDetail(order)} aria-label={`订单 #${order.id} 详情`}>详情</button>
                    {order.status === 'pending' && (
                      <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busyId === order.id} onClick={() => void pay(order)}>
                        {busyId === order.id ? '确认中…' : '确认到账'}
                      </button>
                    )}
                    {order.status === 'paid' && (
                      <button className="p-btn p-btn--sm" type="button" disabled={busyId === order.id} onClick={() => void refund(order)} aria-label={`退款订单 #${order.id}`}>{busyId === order.id ? '退款中…' : '退款'}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <AdminEmpty colSpan={7} filtered={Boolean(filtered)}>还没有订单。</AdminEmpty>}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal
          title={`订单 #${detail.id}`}
          onClose={() => setDetail(null)}
          footer={<button className="p-btn p-btn--sm" type="button" onClick={() => setDetail(null)}>关闭</button>}
        >
          <dl className="a-dl">
            <dt>玩家</dt><dd><Link href={`/admin/users/${detail.userId}`}>{detail.nickname}</Link>（{detail.email}）</dd>
            <dt>点数</dt><dd>{detail.points.toLocaleString('zh-CN')} 点</dd>
            <dt>金额</dt><dd>{yuan(detail.priceCents)}</dd>
            <dt>状态</dt><dd>{STATUS_LABEL[detail.status] ?? detail.status}</dd>
            {detail.provider && <><dt>渠道</dt><dd>{detail.provider}</dd></>}
            <dt>创建时间</dt><dd><LocalTime value={detail.createdAt} /></dd>
            <dt>到账时间</dt><dd>{detail.paidAt ? <LocalTime value={detail.paidAt} /> : '—'}</dd>
          </dl>
        </Modal>
      )}
    </>
  );
}

// 订单 KPI：全站口径，每张卡可点进对应筛选
export function OrderKpis({ stats, currency = 'USD' }: { stats: OrderStats; currency?: string }) {
  const yuan = (cents: number) => formatMoney(cents, currency);
  return (
        <div className="p-kpis" style={{ marginBottom: 20 }}>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/orders?status=paid">
            <div className="p-kpi-label">今日实收</div>
            <div className="p-kpi-value">{yuan(stats.paidToday.cents)}</div>
            <div className="p-kpi-delta">{stats.paidToday.n} 笔订单</div>
          </Link>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/orders?status=pending">
            <div className="p-kpi-label">待支付</div>
            <div className="p-kpi-value">{stats.pending.n} 笔</div>
            <div className={`p-kpi-delta${stats.pending.n ? ' p-kpi-delta--down' : ''}`}>{yuan(stats.pending.cents)}</div>
          </Link>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/orders?status=paid">
            <div className="p-kpi-label">本月收入</div>
            <div className="p-kpi-value">{yuan(stats.paidMonth.cents)}</div>
            <div className="p-kpi-delta">{stats.paidMonth.n} 笔已到账</div>
          </Link>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/orders?status=refunded">
            <div className="p-kpi-label">退款</div>
            <div className="p-kpi-value">{stats.refunded.n} 笔</div>
            <div className="p-kpi-delta">{yuan(stats.refunded.cents)}</div>
          </Link>
        </div>
  );
}

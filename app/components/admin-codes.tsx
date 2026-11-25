'use client';

import { LocalTime } from '@/components/local-time';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { useNotice } from '@/components/admin-feedback';
import { AdminEmpty, SortTh } from '@/components/admin-list';

type Code = { id: number; code: string; amount: number; note: string; usedBy: number | null; usedByName: string | null; createdByName: string | null; createdAt: number; usedAt?: number | null };
export type CodeStats = { total: number; unused: number; used: number; month: number; unusedPoints: number };

// 兑换码：生成区 + 统一列表（搜索 / 状态 / 排序 / 分页都由服务端按 URL 参数查询，见 lib/admin-query.ts queryCodes）。
// KPI 是全表口径；列表工具栏与分页在页面里（app/admin/codes/page.tsx）。
export function AdminCodes({ rows, stats, sort, filtered, toolbar, pager }: {
  rows: Code[]; stats: CodeStats; sort: { sort: string; dir: 'asc' | 'desc' }; filtered: boolean; toolbar: ReactNode; pager: ReactNode;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('500');
  const [count, setCount] = useState('5');
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<Code[]>([]);
  const [error, setError] = useState('');
  const setNotice = useNotice();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ codes: Code[] }>('/api/admin/codes', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), count: Number(count), note }),
      });
      setCreated(result.codes);
      setNotice(`已生成 ${result.codes.length} 个兑换码`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((current) => (current === code ? null : current)), 1200);
    } catch {
      setError('复制失败，请手动选中');
    }
  };


  return (
    <>
      <ErrorLine message={error} />
      <div className="p-kpis" style={{ marginBottom: 20 }}>
        <div className="p-card p-card--pad"><div className="p-kpi-label">未使用</div><div className="p-kpi-value">{stats.unused}</div><div className="p-kpi-delta">{`共 ${stats.unusedPoints.toLocaleString('zh-CN')} 点待兑换`}</div></div>
        <div className="p-card p-card--pad"><div className="p-kpi-label">已使用</div><div className="p-kpi-value">{stats.used}</div><div className="p-kpi-delta">已兑换</div></div>
        <div className="p-card p-card--pad"><div className="p-kpi-label">本月生成</div><div className="p-kpi-value">{stats.month}</div><div className="p-kpi-delta">本月 1 日起</div></div>
        <div className="p-card p-card--pad"><div className="p-kpi-label">总数</div><div className="p-kpi-value">{stats.total}</div><div className="p-kpi-delta">全部兑换码</div></div>
      </div>
      <section className="p-card p-card--pad">
        <h2 className="p-form-section-title">生成兑换码</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="p-small">每码点数</span>
          <input className="p-input" style={{ width: 110 }} type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="每码点数" />
          <span className="p-small">数量</span>
          <input className="p-input" style={{ width: 90 }} type="number" min={1} max={100} value={count} onChange={(event) => setCount(event.target.value)} aria-label="数量" />
          <input className="p-input" style={{ flex: '1 1 160px' }} value={note} placeholder="备注（可选）" onChange={(event) => setNote(event.target.value)} aria-label="备注" />
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void generate()}>{busy ? '生成中…' : '生成'}</button>
        </div>
        {created.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="small" style={{ margin: '0 0 6px' }}>刚生成的码（点一下复制）：</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {created.map((code) => (
                <button key={code.id} className="p-chip" type="button" onClick={() => void copy(code.code)}>
                  {copied === code.code ? '已复制' : code.code}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="p-card" style={{ marginTop: 20 }}>
        <div className="p-block-head"><h2>兑换码列表</h2></div>
        {toolbar}
        <div className="admin-table-wrap">
          <table className="admin-table a-cards">
            <thead><tr><th>兑换码</th><SortTh k="amount" label="点数" current={sort} /><th>备注</th><th>创建人</th><th>使用人</th><th>状态</th><SortTh k="id" label="生成时间" current={sort} /></tr></thead>
            <tbody>
              {rows.map((code) => (
                <tr key={code.id}>
                  <td data-label="兑换码" className="a-primary" style={{ fontFamily: 'ui-monospace, monospace' }}>{code.code}</td>
                  <td data-label="点数">{code.amount} 点</td>
                  <td data-label="备注">{code.note || '—'}</td>
                  <td data-label="创建人">{code.createdByName ?? '—'}</td>
                  <td data-label="使用人">{code.usedByName ?? '—'}</td>
                  <td data-label="状态"><span className={`p-pill p-pill--sm ${code.usedBy ? 'p-pill--outline' : 'p-pill--ok'}`}>{code.usedBy ? '已使用' : '未使用'}</span></td>
                  <td data-label="生成时间" className="small"><LocalTime value={code.createdAt} /></td>
                </tr>
              ))}
              {!rows.length && <AdminEmpty colSpan={7} filtered={filtered}>还没有兑换码。</AdminEmpty>}
            </tbody>
          </table>
        </div>
        {pager}
      </section>
    </>
  );
}

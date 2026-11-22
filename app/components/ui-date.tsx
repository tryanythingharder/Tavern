'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui-select';

// 年 / 月 / 日 三个站内下拉框，替代 <input type="date"> 的原生日历弹窗。value 与原生一样是 'YYYY-MM-DD'（未选完时为 ''）。
type Props = { value: string; onChange: (value: string) => void; min?: string; max?: string; id?: string; className?: string; 'aria-label'?: string };

const pad = (n: number) => String(n).padStart(2, '0');

export function DateField({ value, onChange, min = '1900-01-01', max, id, className = 'p-input', ...rest }: Props) {
  const today = new Date();
  const maxDate = max ?? `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const [minY] = min.split('-').map(Number);
  const [maxY] = maxDate.split('-').map(Number);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // 没选完的部分留在本地；三项都选了才往外抛完整日期，外部改了 value 就跟着同步
  const [parts, setParts] = useState({ y: 0, m: 0, d: 0 });
  useEffect(() => {
    if (match) setParts({ y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const { y, m, d } = parts;
  const partial = (key: 'y' | 'm' | 'd', n: number) => {
    const next = { ...parts, [key]: n };
    setParts(next);
    if (next.y && next.m && next.d) {
      const days = new Date(next.y, next.m, 0).getDate();
      const iso = `${next.y}-${pad(next.m)}-${pad(Math.min(next.d, days))}`;
      onChange(iso < min ? min : iso > maxDate ? maxDate : iso);
    } else if (value) onChange('');
  };
  const years: number[] = [];
  for (let year = maxY; year >= minY; year -= 1) years.push(year);
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return (
    <div className="ui-date" role="group" aria-label={rest['aria-label']}>
      <Select id={id} className={className} value={y || ''} aria-label={en ? 'Year' : '年'} onChange={(event) => partial('y', Number(event.target.value))}>
        <option value="">{en ? 'Year' : '年'}</option>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </Select>
      <Select className={className} value={m || ''} aria-label={en ? 'Month' : '月'} onChange={(event) => partial('m', Number(event.target.value))}>
        <option value="">{en ? 'Month' : '月'}</option>
        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{en ? i + 1 : `${i + 1} 月`}</option>)}
      </Select>
      <Select className={className} value={d || ''} aria-label={en ? 'Day' : '日'} onChange={(event) => partial('d', Number(event.target.value))}>
        <option value="">{en ? 'Day' : '日'}</option>
        {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{en ? i + 1 : `${i + 1} 日`}</option>)}
      </Select>
    </div>
  );
}

/** 表单里用（服务端 action 读 name）：带隐藏 input 的日期选择 */
export function DateFormField({ name, id, min, max, className = 'p-input' }: { name: string; id?: string; min?: string; max?: string; className?: string }) {
  const [value, setValue] = useState('');
  return (
    <>
      <DateField id={id} className={className} min={min} max={max} value={value} onChange={setValue} />
      <input type="hidden" name={name} value={value} />
    </>
  );
}

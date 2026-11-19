'use client';

import { currentLocale, tr } from '@/lib/i18n/runtime';
import type { CompatReport } from '@/lib/card-compat';

// 导入兼容体检结果（lib/card-compat.ts）：要注意的项逐条列出，照常生效的收进一行
export function CompatList({ report }: { report?: CompatReport | null }) {
  if (!report || !report.items.length) return null;
  const issues = report.items.filter((item) => item.level !== 'ok');
  const fine = report.items.filter((item) => item.level === 'ok');
  return (
    <div className="ci-compat" aria-label={tr('兼容性')}>
      {issues.length > 0 && (
        <ul className="ci-compat-list">
          {issues.map((item) => (
            <li key={item.key} className={`ci-compat-item is-${item.level}`}>
              <span className="ci-compat-dot" aria-hidden="true" />
              <span className="ci-compat-tag">{item.level === 'no' ? tr('不支持') : tr('部分支持')}</span>
              <span className="ci-compat-text"><b>{item.label}</b>{item.detail ? <span className="ci-compat-detail">{item.detail}</span> : null}</span>
            </li>
          ))}
        </ul>
      )}
      {fine.length > 0 && (
        <p className="ci-compat-ok">
          <span className="ci-compat-dot" aria-hidden="true" />
          {tr('照常生效：')}{fine.map((item) => item.label).join(currentLocale() === 'en' ? ', ' : '、')}
        </p>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { sendClientError } from '@/components/error-reporter';

// 页面级错误兜底：保留站点外壳，给出重试与返回首页
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    sendClientError(error.message || 'render error', error.stack);
  }, [error]);
  return (
    <div className="p-inner err-page">
      <p className="err-kicker">出了点状况</p>
      <h1 className="err-title">这一页没能翻开。</h1>
      <p className="err-text">可能是网络抖了一下，或者服务器刚好在忙。你的故事都还在。{error.digest ? <small> 错误编号 {error.digest}</small> : null}</p>
      <div className="err-actions">
        <button className="p-btn p-btn--primary" type="button" onClick={() => reset()}>重试</button>
        <Link className="p-btn" href="/">回到首页</Link>
      </div>
    </div>
  );
}

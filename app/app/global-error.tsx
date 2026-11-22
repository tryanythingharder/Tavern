'use client';

// 根布局都挂了时的最后兜底：不依赖任何站点样式
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8f8fa', color: '#1b1b1d', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>夜话暂时打不开</h1>
          <p style={{ color: '#6b6b73', margin: '0 0 16px' }}>我们已经记录了这个问题，请稍后再试。</p>
          <button type="button" onClick={() => reset()} style={{ padding: '10px 18px', border: 0, borderRadius: 8, background: '#c9401f', color: '#fff', fontSize: 14, cursor: 'pointer' }}>重试</button>
        </div>
      </body>
    </html>
  );
}

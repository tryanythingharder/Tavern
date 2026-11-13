// 路由切换时的骨架屏；延迟 180ms 才淡入，快速页面不会闪
export default function Loading() {
  return (
    <div className="p-inner" aria-busy="true" aria-live="polite">
      <div className="rd-skeleton">
        <div className="rd-sk rd-sk-hero" />
        <div className="rd-sk rd-sk-title" />
        <div className="rd-sk-row">
          <div className="rd-sk rd-sk-card" />
          <div className="rd-sk rd-sk-card" />
          <div className="rd-sk rd-sk-card" />
          <div className="rd-sk rd-sk-card" />
        </div>
      </div>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>加载中</span>
    </div>
  );
}

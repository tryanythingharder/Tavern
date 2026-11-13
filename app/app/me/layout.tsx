import type { ReactNode } from 'react';
import { SettingsToc } from '@/components/settings-toc';

// 设置区统一骨架：桌面左侧是 SiteShell 的设置侧栏，手机显示 p-toc 横向胶囊
export default function MeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="p-inner">
      <header className="p-page-title">
        <div>
          <h1>我的</h1>
          <p>账号、身份、点数和故事偏好。</p>
        </div>
      </header>
      <div className="p-settings">
        <SettingsToc />
        <div className="p-settings-main">{children}</div>
      </div>
    </div>
  );
}

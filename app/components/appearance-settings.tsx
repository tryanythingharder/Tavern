'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

type Background = 'default' | 'warm';

export function AppearanceSettings({ initial }: { initial: { fontScale: number; background: Background } }) {
  const [scale, setScale] = useState(initial.fontScale);
  const [background, setBackground] = useState<Background>(initial.background);
  const [error, setError] = useState('');

  const save = async (patch: { fontScale?: number; background?: Background }) => {
    setError('');
    try {
      await api('/api/me/preferences', { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const changeScale = (value: number) => {
    setScale(value);
    document.body.style.setProperty('--rp-font-scale', String(value / 100));
    void save({ fontScale: value });
  };

  const changeBackground = (value: Background) => {
    setBackground(value);
    document.body.dataset.chatBg = value;
    void save({ background: value });
  };

  return (
    <div className="p-card p-card--pad">
      <div className="p-label-row">
        <span className="p-label">字号</span>
        <span className="p-range-val">{scale}%</span>
      </div>
      <input
        className="p-range"
        type="range"
        min={85}
        max={120}
        step={5}
        value={scale}
        aria-label="聊天字号"
        onChange={(event) => changeScale(Number(event.target.value))}
      />
      <div className="p-label-row" style={{ marginTop: 20 }}>
        <span className="p-label">背景</span>
      </div>
      <div className="p-swatches">
        <button className={`p-swatch-wrap${background === 'default' ? ' is-active' : ''}`} type="button" data-swatch="default" aria-pressed={background === 'default'} onClick={() => changeBackground('default')}>
          <span className="p-swatch p-swatch--default" />
          <span className="p-swatch-name">默认</span>
        </button>
        <button className={`p-swatch-wrap${background === 'warm' ? ' is-active' : ''}`} type="button" data-swatch="warm" aria-pressed={background === 'warm'} onClick={() => changeBackground('warm')}>
          <span className="p-swatch p-swatch--warm" />
          <span className="p-swatch-name">暖灰</span>
        </button>
      </div>
      <p className="p-hint">只影响你自己的对话阅读体验，不改变其他玩家看到的页面。</p>
      {error && <p className="p-form-error" role="alert">{error}</p>}
    </div>
  );
}

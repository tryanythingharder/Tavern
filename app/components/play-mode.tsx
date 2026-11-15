'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAY_MODE_COOKIE, PLAY_MODES, parsePlayMode, type PlayMode } from '@/lib/play-mode';

const EVENT = 'tavern-mode-change';

function writeMode(mode: PlayMode) {
  document.cookie = `${PLAY_MODE_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.body.dataset.mode = mode;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

// 客户端读当前模式（body[data-mode]），切换时同步更新
export function usePlayMode(): PlayMode {
  const [mode, setMode] = useState<PlayMode>('newbie');
  useEffect(() => {
    setMode(parsePlayMode(document.body.dataset.mode) ?? 'newbie');
    const onChange = (event: Event) => setMode((event as CustomEvent<PlayMode>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return mode;
}

export function useSetPlayMode() {
  const router = useRouter();
  return useCallback((mode: PlayMode) => {
    writeMode(mode);
    router.refresh();
  }, [router]);
}

// 外观抽屉 / 设置页里的切换
export function PlayModeSwitch() {
  const mode = usePlayMode();
  const set = useSetPlayMode();
  return (
    <div className="pm-switch" role="radiogroup" aria-label="玩法模式">
      {PLAY_MODES.map((item) => (
        <button key={item.id} type="button" role="radio" aria-checked={mode === item.id} className={`pm-opt${mode === item.id ? ' is-on' : ''}`} onClick={() => set(item.id)}>
          <strong>{item.label}</strong>
          <span>{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

// 首次进入：问一次「新手还是老玩家」。跳过 = 新手，之后可在「外观」里改。
export function PlayModeChooser() {
  const [open, setOpen] = useState(false);
  const set = useSetPlayMode();
  useEffect(() => {
    if (!parsePlayMode(document.cookie.match(/(?:^|; )tavern_mode=([^;]+)/)?.[1])) setOpen(true);
  }, []);
  if (!open) return null;
  const choose = (mode: PlayMode) => { setOpen(false); set(mode); };
  return (
    <div className="pm-backdrop" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <div className="pm-card">
        <p className="pm-kicker">欢迎来到酒馆</p>
        <h2 id="pm-title">你玩过 SillyTavern 吗？</h2>
        <p className="pm-lead">选一个最顺手的方式开始。两种模式功能完全一样，只是展示方式不同，随时可以在「外观」里切换。</p>
        <div className="pm-grid">
          <button type="button" className="pm-choice" onClick={() => choose('newbie')}>
            <span className="pm-badge">推荐</span>
            <strong>第一次玩</strong>
            <span>选个角色就能开聊。台词、动作怎么写，我们边玩边提示；预设、正则这些进阶功能先收起来。</span>
          </button>
          <button type="button" className="pm-choice" onClick={() => choose('veteran')}>
            <strong>我是酒馆老玩家</strong>
            <span>预设、世界书、正则、作者注释、采样参数、上下文预览全部展开，术语和 ST 一一对应，可导入 ST 角色卡与聊天记录。</span>
          </button>
        </div>
        <button type="button" className="pm-skip" onClick={() => choose('newbie')}>先跳过</button>
      </div>
    </div>
  );
}

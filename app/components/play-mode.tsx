'use client';

import { syncPref } from '@/components/sync-prefs';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAY_MODE_COOKIE, PLAY_MODES, parsePlayMode, type PlayMode } from '@/lib/play-mode';

const EVENT = 'tavern-mode-change';

function writeMode(mode: PlayMode) {
  document.cookie = `${PLAY_MODE_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.body.dataset.mode = mode;
  void syncPref('mode', mode);
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

// 注册后首次进入的指引：第一步问玩没玩过；老玩家再选「简单功能 / 酒馆全功能」。
// 跳过 = 新手，之后可在「外观」里改。
export function PlayModeChooser() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'who' | 'depth'>('who');
  const set = useSetPlayMode();
  useEffect(() => {
    if (!parsePlayMode(document.cookie.match(/(?:^|; )tavern_mode=([^;]+)/)?.[1])) setOpen(true);
  }, []);
  if (!open) return null;
  const choose = (mode: PlayMode) => { setOpen(false); set(mode); };
  return (
    <div className="pm-backdrop" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <div className="pm-card" data-step={step}>
        <div className="pm-steps" aria-hidden="true"><i className="is-on" /><i className={step === 'depth' ? 'is-on' : ''} /></div>
        {step === 'who' ? (
          <>
            <p className="pm-kicker">欢迎来到酒馆</p>
            <h2 id="pm-title">你玩过 SillyTavern（酒馆）吗？</h2>
            <p className="pm-lead">按你的经验来布置界面。功能一样都不少，只是默认展示多少不同，随时可以在「外观」里改。</p>
            <div className="pm-grid">
              <button type="button" className="pm-choice" onClick={() => choose('newbie')}>
                <span className="pm-badge">推荐</span>
                <strong>从未玩过</strong>
                <span>界面干净、设置很少。选个角色就能开聊，台词、动作怎么写边玩边提示。</span>
              </button>
              <button type="button" className="pm-choice" onClick={() => setStep('depth')}>
                <strong>我是酒馆老玩家 →</strong>
                <span>预设、世界书、正则、角色卡、ST 角色卡与聊天记录导入，术语和 ST 一一对应。</span>
              </button>
            </div>
            <button type="button" className="pm-skip" onClick={() => choose('newbie')}>先跳过</button>
          </>
        ) : (
          <>
            <p className="pm-kicker">老玩家 · 第 2 步</p>
            <h2 id="pm-title">要多少功能？</h2>
            <p className="pm-lead">两种都能用全部 ST 功能，区别是参数默认露出多少。以后在「外观 → 玩法模式」里随时切。</p>
            <div className="pm-grid">
              <button type="button" className="pm-choice" onClick={() => choose('simple')}>
                <strong>简单功能</strong>
                <span>预设、世界书、正则、身份都在；采样参数只露 temperature、top_p、max_tokens、复读惩罚这几项，其余收进「更多参数」。</span>
              </button>
              <button type="button" className="pm-choice" onClick={() => choose('full')}>
                <span className="pm-badge">ST 全开</span>
                <strong>酒馆全功能</strong>
                <span>全部采样参数（top_k、min_p、typical_p、rep_pen_range/slope、seed…）、上下文模板、Instruct 序列全部展开，对话里直接调参。</span>
              </button>
            </div>
            <button type="button" className="pm-skip" onClick={() => setStep('who')}>← 返回上一步</button>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useId, type ReactNode } from 'react';
import { ThemeSwitch } from '@/components/theme-switch';
import { resetAppearance, setAppearance, useAppearance } from '@/components/appearance-store';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  FONT_OPTIONS,
  RADIUS_LABELS,
  RADIUS_STEPS,
  SECTION_KEYS,
  TEXT_COLOR_PRESETS,
  TINTS,
  isDefaultAppearance,
  type AppearancePrefs,
  type FontChoice,
} from '@/lib/appearance';
import type { Theme } from '@/lib/theme';

// 外观设置面板：抽屉和 /me/appearance 页面共用同一份组件与状态。

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="ua-row">
      <span className="ua-label">{label}</span>
      <div className="ua-seg" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={value === option.id ? 'is-on' : undefined} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({ label, value, display, min, max, step, onChange, onFollow, following }: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (value: number) => void; onFollow?: () => void; following?: boolean;
}) {
  const id = useId();
  return (
    <div className="ua-row">
      <div className="ua-label-row">
        <label className="ua-label" htmlFor={id}>{label}</label>
        <span className="ua-val">
          {following ? '跟随主题' : display}
          {onFollow && !following && <button type="button" className="ua-mini-link" onClick={onFollow}>跟随主题</button>}
        </span>
      </div>
      <input id={id} className="ua-range" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function Colors({ label, value, presets, onChange, sample }: { label: string; value: string | null; presets: { hex: string; label: string }[]; onChange: (value: string | null) => void; sample?: ReactNode }) {
  const id = useId();
  return (
    <div className="ua-row">
      <div className="ua-label-row">
        <span className="ua-label">{label}</span>
        {sample}
      </div>
      <div className="ua-colors" role="radiogroup" aria-label={label}>
        <button type="button" role="radio" aria-checked={value === null} className={`ua-color ua-color--theme${value === null ? ' is-on' : ''}`} onClick={() => onChange(null)} title="跟随主题">
          <span aria-hidden="true">默认</span>
        </button>
        {presets.map((preset) => (
          <button key={preset.hex} type="button" role="radio" aria-checked={value === preset.hex} aria-label={preset.label} title={preset.label} className={`ua-color${value === preset.hex ? ' is-on' : ''}`} style={{ ['--sw' as string]: preset.hex }} onClick={() => onChange(preset.hex)} />
        ))}
        <label className={`ua-color ua-color--custom${value && !presets.some((preset) => preset.hex === value) ? ' is-on' : ''}`} htmlFor={id} title="自定义颜色" style={value ? { ['--sw' as string]: value } : undefined}>
          <span aria-hidden="true">＋</span>
          <input id={id} type="color" value={value ?? '#4b5bf5'} aria-label={`${label}：自定义颜色`} onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="ua-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function Section({ title, keys, prefs, children }: { title: string; keys?: (keyof AppearancePrefs)[]; prefs: AppearancePrefs; children: ReactNode }) {
  const dirty = keys ? keys.some((key) => prefs[key] !== DEFAULT_APPEARANCE[key]) : false;
  return (
    <section className="ua-section">
      <header className="ua-section-head">
        <h3>{title}</h3>
        {keys && (
          <button type="button" className="ua-reset" disabled={!dirty} onClick={() => resetAppearance(keys)}>恢复默认</button>
        )}
      </header>
      {children}
    </section>
  );
}

const fontOpts = FONT_OPTIONS as { id: FontChoice; label: string }[];
const triOpts = (on: string, off: string) => [
  { id: 'theme' as const, label: '跟随主题' },
  { id: 'on' as const, label: on },
  { id: 'off' as const, label: off },
];

export function AppearancePanel({ theme, initial, showTheme = true }: { theme: Theme; initial?: AppearancePrefs; showTheme?: boolean }) {
  const prefs = useAppearance(initial);
  const set = setAppearance;
  const radiusIndex = prefs.radius === null ? 2 : RADIUS_STEPS.indexOf(prefs.radius as (typeof RADIUS_STEPS)[number]);

  return (
    <div className="ua-panel">
      {showTheme && (
        <Section title="主题" prefs={prefs}>
          <ThemeSwitch initial={theme} variant="cards" />
        </Section>
      )}

      <Section title="字体" keys={SECTION_KEYS.font} prefs={prefs}>
        <Seg label="界面字体" value={prefs.uiFont} options={fontOpts} onChange={(uiFont) => set({ uiFont })} />
        <Seg label="正文字体（对话内容）" value={prefs.bodyFont} options={fontOpts} onChange={(bodyFont) => set({ bodyFont })} />
        <p className="ua-hint">只使用系统自带字体；设备上没有的字体会自动退回相近字体。</p>
      </Section>

      <Section title="字号与排版" keys={SECTION_KEYS.size} prefs={prefs}>
        <Slider label="界面缩放" value={prefs.uiScale} display={`${prefs.uiScale}%`} min={90} max={120} step={5} onChange={(uiScale) => set({ uiScale })} />
        <Slider label="对话字号" value={prefs.chatScale ?? 100} display={`${prefs.chatScale ?? 100}%`} min={80} max={140} step={5} following={prefs.chatScale === null} onChange={(chatScale) => set({ chatScale })} onFollow={() => set({ chatScale: null })} />
        <Slider label="行高" value={prefs.lineHeight ?? 1.8} display={(prefs.lineHeight ?? 1.8).toFixed(2)} min={1.5} max={2.1} step={0.05} following={prefs.lineHeight === null} onChange={(lineHeight) => set({ lineHeight })} onFollow={() => set({ lineHeight: null })} />
        <Seg label="对话栏宽度" value={prefs.chatWidth} options={[{ id: 'theme', label: '跟随主题' }, { id: 'narrow', label: '窄' }, { id: 'standard', label: '标准' }, { id: 'wide', label: '宽' }, { id: 'full', label: '超宽' }]} onChange={(chatWidth) => set({ chatWidth })} />
        <Seg label="段落间距" value={prefs.paraSpacing} options={[{ id: 'theme', label: '跟随主题' }, { id: 'tight', label: '紧凑' }, { id: 'normal', label: '适中' }, { id: 'loose', label: '宽松' }]} onChange={(paraSpacing) => set({ paraSpacing })} />
      </Section>

      <Section title="文本显示" keys={SECTION_KEYS.text} prefs={prefs}>
        <div className="ua-sample" aria-hidden="true">
          <p className="rp-p"><em className="rp-act">她把伞收起，抖了抖水珠。</em><span className="rp-say">「你终于来了。」</span><span className="rp-say rp-think">『他还记得吗？』</span></p>
        </div>
        <Colors label="对白「」" value={prefs.sayColor} presets={TEXT_COLOR_PRESETS} onChange={(sayColor) => set({ sayColor })} />
        <Colors label="旁白 / 动作 *…*" value={prefs.actColor} presets={TEXT_COLOR_PRESETS} onChange={(actColor) => set({ actColor })} />
        <Colors label="心理『』" value={prefs.thinkColor} presets={TEXT_COLOR_PRESETS} onChange={(thinkColor) => set({ thinkColor })} />
        <Seg label="旁白斜体" value={prefs.narrItalic} options={triOpts('斜体', '正体')} onChange={(narrItalic) => set({ narrItalic })} />
        <Seg label="旁白弱化" value={prefs.narrDim} options={triOpts('弱化', '不弱化')} onChange={(narrDim) => set({ narrDim })} />
        <Seg label="消息样式" value={prefs.msgStyle} options={[{ id: 'theme', label: '跟随主题' }, { id: 'bubble', label: '气泡' }, { id: 'flat', label: '平铺' }]} onChange={(msgStyle) => set({ msgStyle })} />
        <div className="ua-toggles">
          <Toggle label="显示头像" checked={prefs.avatars} onChange={(avatars) => set({ avatars })} />
          <Toggle label="显示名字" checked={prefs.names} onChange={(names) => set({ names })} />
          <Toggle label="显示消息时间" checked={prefs.stamps} onChange={(stamps) => set({ stamps })} />
        </div>
        <p className="ua-hint">文字颜色在亮色和暗色主题下共用，换主题后可以再调一下。</p>
      </Section>

      <Section title="配色" keys={SECTION_KEYS.color} prefs={prefs}>
        <Colors label="强调色" value={prefs.accent} presets={ACCENT_PRESETS.slice(1)} onChange={(accent) => set({ accent })} />
        <div className="ua-row">
          <span className="ua-label">背景色调</span>
          <div className="ua-colors" role="radiogroup" aria-label="背景色调">
            <button type="button" role="radio" aria-checked={prefs.tint === 'none'} className={`ua-color ua-color--theme${prefs.tint === 'none' ? ' is-on' : ''}`} onClick={() => set({ tint: 'none' })}>
              <span aria-hidden="true">无</span>
            </button>
            {(Object.keys(TINTS) as (keyof typeof TINTS)[]).map((tint) => (
              <button key={tint} type="button" role="radio" aria-checked={prefs.tint === tint} aria-label={TINTS[tint].label} title={TINTS[tint].label} className={`ua-color${prefs.tint === tint ? ' is-on' : ''}`} style={{ ['--sw' as string]: TINTS[tint].swatch }} onClick={() => set({ tint })} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="圆角与边缘" keys={SECTION_KEYS.shape} prefs={prefs}>
        <Slider
          label="圆角"
          value={radiusIndex < 0 ? 2 : radiusIndex}
          display={RADIUS_LABELS[radiusIndex < 0 ? 2 : radiusIndex]}
          min={0}
          max={RADIUS_STEPS.length - 1}
          step={1}
          following={prefs.radius === null}
          onChange={(index) => set({ radius: RADIUS_STEPS[index] })}
          onFollow={() => set({ radius: null })}
        />
        <Seg label="描边" value={prefs.border} options={[{ id: 'theme', label: '跟随主题' }, { id: 'none', label: '无' }, { id: 'hairline', label: '细线' }, { id: 'strong', label: '加粗' }]} onChange={(border) => set({ border })} />
        <Seg label="阴影" value={prefs.shadow} options={[{ id: 'theme', label: '跟随主题' }, { id: 'none', label: '无' }, { id: 'soft', label: '柔和' }, { id: 'strong', label: '浓重' }]} onChange={(shadow) => set({ shadow })} />
      </Section>

      <Section title="动效" keys={SECTION_KEYS.motion} prefs={prefs}>
        <Seg label="动画" value={prefs.motion} options={[{ id: 'full', label: '完整' }, { id: 'reduced', label: '减弱' }, { id: 'off', label: '关闭' }]} onChange={(motion) => set({ motion })} />
        <p className="ua-hint">系统开启「减少动态效果」时，会始终按减弱处理。</p>
      </Section>

      <div className="ua-foot">
        <button type="button" className="ua-reset-all" disabled={isDefaultAppearance(prefs)} onClick={() => resetAppearance()}>全部恢复默认</button>
        <span className="ua-hint">设置保存在本设备的浏览器里。</span>
      </div>
    </div>
  );
}

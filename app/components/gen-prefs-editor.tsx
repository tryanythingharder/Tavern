'use client';

import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { usePlayMode } from '@/components/play-mode';
import type { GenPrefs } from '@/lib/gen-prefs';

// ST「高级格式化 / 用户设置」里不随预设切换的全局项
export function GenPrefsEditor({ initial }: { initial: GenPrefs }) {
  const mode = usePlayMode();
  const full = mode === 'full';
  const [prefs, setPrefs] = useState<GenPrefs>(initial);
  const [stopText, setStopText] = useState(() => (initial.stopStrings.length ? JSON.stringify(initial.stopStrings) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const patch = (next: Partial<GenPrefs>) => { setPrefs((prev) => ({ ...prev, ...next })); setSaved(false); };
  const patchAc = (next: Partial<GenPrefs['autoContinue']>) => patch({ autoContinue: { ...prefs.autoContinue, ...next } });
  const patchRs = (next: Partial<GenPrefs['reasoning']>) => patch({ reasoning: { ...prefs.reasoning, ...next } });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { prefs: next } = await api<{ prefs: GenPrefs }>('/api/me/gen-prefs', { method: 'PATCH', body: JSON.stringify({ ...prefs, stopStrings: stopText }) });
      setPrefs(next);
      setStopText(next.stopStrings.length ? JSON.stringify(next.stopStrings) : '');
      setSaved(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-gen-prefs">
      <ErrorLine message={error} />
      <h3 className="p-form-section-title">回复处理</h3>
      <label className="p-check">
        <input type="checkbox" checked={prefs.trimSentences} onChange={(event) => patch({ trimSentences: event.target.checked })} />
        <span>裁掉结尾不完整的句子（ST 的 Trim Incomplete Sentences）</span>
      </label>
      <label className="p-check">
        <input type="checkbox" checked={prefs.autoContinue.enabled} onChange={(event) => patchAc({ enabled: event.target.checked })} />
        <span>自动继续：回复不到目标长度时自动接着写（ST 的 Auto-Continue）</span>
      </label>
      {prefs.autoContinue.enabled && (
        <div className="p-field p-gen-prefs-inline">
          <label htmlFor="gp-target">目标长度（tokens）</label>
          <input id="gp-target" className="p-input" type="number" min={0} max={4096} step={10} value={prefs.autoContinue.target} onChange={(event) => patchAc({ target: Number(event.target.value) })} />
        </div>
      )}

      {full && (
        <>
          <h3 className="p-form-section-title">自定义停止词</h3>
          <div className="p-field">
            <label htmlFor="gp-stops">模型输出到这些文字就停下（JSON 数组，也可以每行一个）</label>
            <textarea id="gp-stops" className="p-textarea" rows={2} placeholder='["\n{{user}}:", "###"]' value={stopText} onChange={(event) => { setStopText(event.target.value); setSaved(false); }} />
          </div>
          <label className="p-check">
            <input type="checkbox" checked={prefs.stopMacros} onChange={(event) => patch({ stopMacros: event.target.checked })} />
            <span>停止词里替换宏（{'{{user}}'} / {'{{char}}'}）</span>
          </label>
        </>
      )}

      <h3 className="p-form-section-title">思考内容</h3>
      <label className="p-check">
        <input type="checkbox" checked={prefs.reasoning.autoExpand} onChange={(event) => patchRs({ autoExpand: event.target.checked })} />
        <span>默认展开模型的思考过程</span>
      </label>
      {full && (
        <>
          <label className="p-check">
            <input type="checkbox" checked={prefs.reasoning.autoParse} onChange={(event) => patchRs({ autoParse: event.target.checked })} />
            <span>自动解析：正文以前缀开头时，把前缀到后缀之间当作思考（ST 的 Auto-Parse）</span>
          </label>
          <div className="p-field-row">
            <div className="p-field">
              <label htmlFor="gp-prefix">前缀</label>
              <input id="gp-prefix" className="p-input" value={prefs.reasoning.prefix} maxLength={40} onChange={(event) => patchRs({ prefix: event.target.value })} />
            </div>
            <div className="p-field">
              <label htmlFor="gp-suffix">后缀</label>
              <input id="gp-suffix" className="p-input" value={prefs.reasoning.suffix} maxLength={40} onChange={(event) => patchRs({ suffix: event.target.value })} />
            </div>
          </div>
          <label className="p-check">
            <input type="checkbox" checked={prefs.reasoning.addToPrompts} onChange={(event) => patchRs({ addToPrompts: event.target.checked })} />
            <span>把之前的思考加进提示词（ST 的 Add to Prompts）</span>
          </label>
          {prefs.reasoning.addToPrompts && (
            <div className="p-field p-gen-prefs-inline">
              <label htmlFor="gp-max">最多加入几条</label>
              <input id="gp-max" className="p-input" type="number" min={0} max={50} value={prefs.reasoning.maxAdditions} onChange={(event) => patchRs({ maxAdditions: Number(event.target.value) })} />
            </div>
          )}
        </>
      )}

      <div className="p-gen-prefs-actions">
        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
        {saved && <span className="small">已保存</span>}
      </div>
    </div>
  );
}

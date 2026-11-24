'use client';

import type React from 'react';
import { Modal } from '@/components/settings-ui';

// 单聊 / 群聊共用的「生成一张插图」弹窗（从 chat-room.tsx、room-chat.tsx 各自的一份合并）。
// 两边只差模式说明、示例文案、群聊多一个「画谁」选择和末尾的一句说明，用 props 传进来。

export type ImageMode = 'scene' | 'last' | 'character' | 'custom';

export type ImageGenModalProps = {
  modes: readonly (readonly [ImageMode, string, string])[];
  mode: ImageMode;
  setMode: (value: ImageMode) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  busy: boolean;
  cost: number;
  placeholders: { custom: string; hint: string };
  /** 「会消耗 N 点」后面那句：生成后插到哪里 */
  tail: string;
  onClose: () => void;
  onSubmit: () => void;
  /** 模式和描述之间的额外字段（群聊的「画谁」） */
  extra?: React.ReactNode;
  /** 描述下面的人物参考说明 */
  refNote?: React.ReactNode;
};

export function ImageGenModal({ modes, mode, setMode, prompt, setPrompt, busy, cost, placeholders, tail, onClose, onSubmit, extra, refNote }: ImageGenModalProps) {
  return (
    <Modal
      title="生成一张插图"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--sm" type="button" onClick={onClose}>取消</button>
          <button className="btn btn--sm btn--primary" type="button" disabled={busy || (mode === 'custom' && !prompt.trim())} onClick={onSubmit}>
            {busy ? (mode === 'custom' ? '生成中…' : '构思画面并生成…') : '生成'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>画什么</label>
        <div className="p-img-modes" role="radiogroup" aria-label="画什么">
          {modes.map(([value, label, desc]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} className={`p-img-mode${mode === value ? ' is-on' : ''}`} disabled={busy} onClick={() => setMode(value)}>
              <strong>{label}</strong><span>{desc}</span>
            </button>
          ))}
        </div>
      </div>
      {extra}
      <div className="field">
        <label>{mode === 'custom' ? '画面描述' : '补充要求（可不填）'}</label>
        <textarea
          className="textarea"
          rows={mode === 'custom' ? 4 : 2}
          value={prompt}
          maxLength={mode === 'custom' ? 900 : 200}
          placeholder={mode === 'custom' ? placeholders.custom : placeholders.hint}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </div>
      {refNote}
      <p className="small" style={{ margin: 0 }}>{mode === 'custom' ? `会消耗 ${cost} 点` : `会先让对话模型按剧情写画面描述（按字数少量扣点），再消耗 ${cost} 点生图`}，{tail}</p>
    </Modal>
  );
}

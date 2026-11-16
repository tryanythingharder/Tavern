'use client';

import { useId, useRef, useState } from 'react';

// 主题化的文件选择：隐藏原生 <input type=file>（避免英文 "Choose File"），支持拖放，显示已选文件名。
export function FileDrop({
  accept,
  disabled = false,
  title,
  hint,
  onFile,
  id,
}: {
  accept: string;
  disabled?: boolean;
  title: string;
  hint?: string;
  onFile: (file: File) => void;
  id?: string;
}) {
  const auto = useId();
  const inputId = id ?? `fd-${auto}`;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState('');

  const take = (file: File | undefined) => {
    if (!file || disabled) return;
    setName(file.name);
    onFile(file);
  };

  return (
    <label
      htmlFor={inputId}
      className={`file-drop${over ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}${name ? ' has-file' : ''}`}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); take(event.dataTransfer.files?.[0]); }}
    >
      <input
        ref={input}
        id={inputId}
        className="file-drop-input"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => { take(event.target.files?.[0]); event.target.value = ''; }}
      />
      <svg className="file-drop-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
      <span className="file-drop-text">
        <b>{name || title}</b>
        <small>{name ? '点击或拖入可替换' : hint ?? '点击选择，或把文件拖到这里'}</small>
      </span>
    </label>
  );
}

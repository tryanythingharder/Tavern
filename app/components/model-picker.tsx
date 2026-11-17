'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayMode } from '@/components/play-mode';

type ModelOption = { id: string; source: string; isDefault: boolean; price?: number; name?: string; summary?: string };

const priceLabel = (price?: number) => (typeof price === 'number' ? `${price} 点/千 tokens` : '');

// 模型名 → 给新手看的友好说明（只是猜测性标签，模型 id 原样保留）
function friendly(id: string): string {
  const name = id.toLowerCase();
  if (/gemini/.test(name)) return '上下文长，记得住更多剧情';
  if (/claude|opus|sonnet/.test(name)) return '文笔细腻，擅长长篇剧情';
  if (/haiku|-mini|flash|lite|turbo|small/.test(name)) return '响应快、省点数';
  if (/gpt-4|gpt-5|o1|o3|o4/.test(name)) return '理解力强，稳定全能';
  if (/deepseek|r1|reason|think/.test(name)) return '会先思考，逻辑和推理强';
  if (/qwen|glm|kimi|moonshot|doubao|yi-/.test(name)) return '中文语感自然';
  return '';
}

// 对话里的模型选择：列出后台启用渠道的全部模型，按会话保存
export function ModelPicker({ chatId, roomId }: { chatId?: number; roomId?: number }) {
  const endpoint = roomId ? `/api/rooms/${roomId}/model` : `/api/chats/${chatId}/settings`;
  const mode = usePlayMode();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [current, setCurrent] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(endpoint, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { model?: string; models?: ModelOption[] } | null) => {
        if (!alive || !data) return;
        setModels(data.models ?? []);
        setCurrent(data.model ?? '');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [endpoint]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!models.length) return null;
  const fallback = models.find((item) => item.isDefault)?.id ?? models[0].id;
  const active = current && models.some((item) => item.id === current) ? current : '';
  const shown = active || fallback;
  const filtered = query.trim() ? models.filter((item) => `${item.id} ${item.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())) : models;

  const pick = async (id: string) => {
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: id }) });
      if (response.ok) setCurrent(id);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <div className="mp" ref={boxRef}>
      <button type="button" className="mp-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} title="切换这段对话使用的模型">
        <span className="mp-dot" aria-hidden="true" />
        <span className="mp-name">{shown}</span>
        {priceLabel(models.find((item) => item.id === shown)?.price) ? <span className="mp-trigger-price">{models.find((item) => item.id === shown)?.price} 点/千</span> : null}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="mp-pop" role="listbox" aria-label="选择模型">
          <div className="mp-head">
            <strong>选择模型</strong>
            <span>{mode === 'newbie' ? '不同模型文风和价格不同，可以随时换着试' : `${models.length} 个可用 · 仅对${roomId ? '本房间' : '本对话'}生效 · 按模型计价`}</span>
          </div>
          {models.length > 8 && (
            <input className="mp-search" placeholder="搜索模型" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          )}
          <div className="mp-list">
            <button type="button" role="option" aria-selected={!active} className={`mp-opt${!active ? ' is-on' : ''}`} disabled={saving} onClick={() => void pick('')}>
              <span className="mp-opt-name">跟随默认</span>
              <span className="mp-opt-note">{mode !== 'newbie' ? `当前为 ${fallback}，按后台优先级自动切换线路` : '站点推荐的模型，线路不通时自动换'}</span>
            </button>
            {filtered.map((item) => {
              const note = item.summary || (mode !== 'newbie' ? item.source : friendly(item.id));
              return (
                <button key={item.id} type="button" role="option" aria-selected={active === item.id} className={`mp-opt${active === item.id ? ' is-on' : ''}`} disabled={saving} onClick={() => void pick(item.id)}>
                  <span className="mp-opt-name">{item.name || item.id}{item.isDefault ? <em className="mp-tag">推荐</em> : null}{priceLabel(item.price) ? <em className="mp-price">{priceLabel(item.price)}</em> : null}</span>
                  {note ? <span className="mp-opt-note">{note}</span> : null}
                </button>
              );
            })}
            {!filtered.length && <p className="mp-empty">没有匹配的模型</p>}
          </div>
          <a className="mp-more" href="/models">模型广场：看介绍、设默认 →</a>
        </div>
      )}
    </div>
  );
}

// 新手引导：第一次进对话时的写法提示，可关
export function NewbieTip() {
  const mode = usePlayMode();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem('tavern-newbie-tip') === '1'); } catch { setHidden(false); }
  }, []);
  if (mode !== 'newbie' || hidden) return null;
  return (
    <div className="pm-tip" role="note">
      <span><b>小提示</b> 直接写台词就行；<code>*动作*</code> 用星号包住；<code>((场外话))</code> 用双括号。不知道接什么？点「▸ 继续」让角色接着演，或「✎ 代写」让 AI 帮你写一句。</span>
      <button type="button" aria-label="不再提示" onClick={() => { setHidden(true); try { localStorage.setItem('tavern-newbie-tip', '1'); } catch { /* 无痕模式 */ } }}>×</button>
    </div>
  );
}

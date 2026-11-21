'use client';

import { useEffect, useRef, useState } from 'react';
import { EXPRESSION_ZH, classifyExpression, pickSprite, type ExpressionLabel, type SpriteMap } from '@/lib/expressions';
import { EXPRESSION_EVENT } from '@/lib/slash-media';
import { publishLiveSprite } from '@/components/live-cover';

// 非沉浸模式的表情立绘（ST expression holder）：跟着最后一条角色回复判断表情，
// 发布给主题侧栏的立绘位（components/live-cover.tsx）。自己不渲染任何东西。

export function ChatSpriteFloat({ sprites }: { sprites: SpriteMap; name?: string }) {
  const [expr, setExpr] = useState<{ label: ExpressionLabel; src: string } | null>(() => pickSprite(sprites, 'neutral'));
  const spritesRef = useRef(sprites);
  spritesRef.current = sprites;
  const cache = useRef(new Map<string, ExpressionLabel>());
  const manual = useRef<{ label: ExpressionLabel; key: string | null } | null>(null);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const all = document.querySelectorAll<HTMLElement>('.p-chat-scroll .p-msg:not(.p-msg-user):not(.p-msg-narrator)');
      const last = all[all.length - 1];
      const map = spritesRef.current;
      if (!last) { setExpr(pickSprite(map, 'neutral')); return; }
      const text = last.querySelector('.p-msg-text')?.textContent ?? '';
      const cacheKey = `${last.id}:${text.length}:${text.slice(-40)}`;
      let label = cache.current.get(cacheKey);
      if (!label) { label = classifyExpression(text); cache.current.set(cacheKey, label); }
      const forced = manual.current;
      if (forced) {
        if (forced.key === null) forced.key = cacheKey;
        if (forced.key === cacheKey) label = forced.label;
        else manual.current = null;
      }
      const pick = pickSprite(map, label, Number(last.id.replace(/\D/g, '')) || 0);
      setExpr((prev) => (prev?.src === pick?.src && prev?.label === pick?.label ? prev : pick));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute); };
    const onSet = (event: Event) => {
      const label = (event as CustomEvent<{ label?: ExpressionLabel }>).detail?.label;
      if (!label) return;
      manual.current = { label, key: null };
      schedule();
    };
    const observer = new MutationObserver(schedule);
    const attach = () => {
      const scroller = document.querySelector('.p-chat-scroll');
      if (scroller) observer.observe(scroller, { childList: true, subtree: true, characterData: true });
      return Boolean(scroller);
    };
    let retry = 0;
    if (!attach()) retry = window.setInterval(() => { if (attach()) window.clearInterval(retry); }, 400);
    window.addEventListener(EXPRESSION_EVENT, onSet);
    schedule();
    return () => {
      observer.disconnect();
      window.clearInterval(retry);
      window.removeEventListener(EXPRESSION_EVENT, onSet);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    publishLiveSprite(expr ? { src: expr.src, label: EXPRESSION_ZH[expr.label] } : null);
  }, [expr]);
  useEffect(() => () => publishLiveSprite(null), []);

  return null;
}

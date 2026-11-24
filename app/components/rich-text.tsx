'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { RpText } from '@/components/rp-text';
import dynamic from 'next/dynamic';
import { applyRegex, type RegexMacros } from '@/lib/regex-apply';
import { splitRich } from '@/lib/rich-segments';
import { stripMvuBlocks } from '@/lib/mvu-text';
import type { RegexRule } from '@/lib/resources';

// 卡美化（HTML 沙盒 iframe）只在消息里真有 HTML 片段时才加载
const HtmlFrame = dynamic(() => import('@/components/html-frame').then((m) => m.HtmlFrame));

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return `${value.length}-${h}`;
}

// 楼层里的 EJS（<% %>）由服务端沙盒渲染（/api/chats/[id]/render）；结果按楼层+原文缓存
const EJS_RE = /<%/;
const renderCache = new Map<string, Promise<string>>();
function renderEjs(chatId: number, messageId: number, key: string): Promise<string> {
  const cacheKey = `${chatId}:${messageId}:${key}`;
  let hit = renderCache.get(cacheKey);
  if (!hit) {
    hit = fetch(`/api/chats/${chatId}/render?message=${messageId}`, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ text?: string }>) : Promise.reject(new Error(String(response.status)))))
      .then((data) => String(data.text ?? ''))
      .catch((error) => {
        renderCache.delete(cacheKey);
        throw error;
      });
    renderCache.set(cacheKey, hit);
    if (renderCache.size > 300) renderCache.delete(renderCache.keys().next().value as string);
  }
  return hit;
}
// 渲染结果回来前先把代码块藏起来，别让玩家看到一闪而过的 <% %>
const stripEjs = (value: string) => value.replace(/<%(?!%)[\s\S]*?%>/g, '');

// 消息正文：先套「仅显示」正则（玩家规则 + 角色卡自带脚本），再把 HTML 片段交给沙盒渲染。
function RichTextInner({
  text,
  streaming = false,
  rules,
  macros,
  role = 'assistant',
  depth,
  variables,
}: {
  text: string;
  streaming?: boolean;
  rules?: RegexRule[];
  macros?: RegexMacros;
  role?: 'user' | 'assistant';
  depth?: number;
  /** 给状态栏脚本读 MVU 变量用：这条消息所在的会话和楼层 */
  variables?: { chatId: number; messageId: number; rev?: string; room?: boolean };
}) {
  const ejsKey = !streaming && variables && EJS_RE.test(text) ? `${hash(text)}:${variables.rev ?? ''}` : '';
  const [ejsText, setEjsText] = useState<{ key: string; text: string } | null>(null);
  // 群聊暂不跑楼层 EJS（只藏掉代码）
  const ejsChat = variables?.room ? 0 : variables?.chatId ?? 0;
  const ejsMessage = variables?.messageId ?? 0;
  useEffect(() => {
    if (!ejsKey || !ejsChat || !ejsMessage) return;
    let alive = true;
    const put = (value: string) => {
      if (alive) setEjsText((prev) => (prev?.key === ejsKey && prev.text === value ? prev : { key: ejsKey, text: value }));
    };
    renderEjs(ejsChat, ejsMessage, ejsKey).then(put, () => put(stripEjs(text)));
    return () => { alive = false; };
  }, [ejsKey, ejsChat, ejsMessage, text]);
  const source = ejsKey && !ejsChat ? stripEjs(text) : ejsKey ? (ejsText?.key === ejsKey ? ejsText.text : stripEjs(text)) : text;

  const shown = useMemo(() => {
    // MVU 的 <UpdateVariable> 命令块只给程序看，不显示（ST 里一般靠卡自带正则藏，没带的卡也别露出来）
    const base = role === 'assistant' ? stripMvuBlocks(source) : source;
    const out = rules?.length ? applyRegex(rules, base, { target: role, purpose: 'display', depth, macros }) : base;
    // 开场白里的 {{user}}/{{char}} 照 ST 显示成名字
    if (!macros || !out.includes('{{')) return out;
    return out.replace(/\{\{char\}\}/gi, macros.char ?? '').replace(/\{\{(?:user|persona)\}\}/gi, macros.user ?? '');
  }, [rules, source, role, depth, macros]);
  const version = useMemo(() => `${hash(text)}:${variables?.rev ?? ''}`, [text, variables?.rev]);
  const segments = useMemo(() => splitRich(shown), [shown]);
  if (segments.length === 1 && segments[0].kind === 'text') return <RpText text={segments[0].text} streaming={streaming} />;
  return (
    <>
      {segments.map((segment, index) => {
        const last = index === segments.length - 1;
        if (segment.kind === 'text') return <RpText key={index} text={segment.text} streaming={streaming && last} />;
        // 生成中不渲染半截 HTML（iframe 每个字都重建会闪），收尾后再显示
        if (streaming) return <div key={index} className="rp-html-pending" role="status">状态栏 / 美化内容生成中…</div>;
        return <HtmlFrame key={`${index}-${hash(segment.html)}`} html={segment.html} variables={variables ? { chatId: variables.chatId, messageId: variables.messageId, version, room: variables.room } : undefined} macros={macros} />;
      })}
    </>
  );
}

type RichTextProps = Parameters<typeof RichTextInner>[0];

// 只有正则规则限定了深度时，深度才影响显示；否则新消息进来时老消息不必重画（长会话发送卡顿的主因）
export function usesDepth(rules?: RegexRule[]): boolean {
  return Boolean(rules?.some((rule) => (rule.depthFrom !== null && rule.depthFrom >= -1) || (rule.depthTo !== null && rule.depthTo >= 0)));
}

function sameProps(a: RichTextProps, b: RichTextProps): boolean {
  if (a.text !== b.text || a.streaming !== b.streaming || a.rules !== b.rules || a.macros !== b.macros || a.role !== b.role) return false;
  if (a.depth !== b.depth && usesDepth(b.rules)) return false;
  const va = a.variables; const vb = b.variables;
  if (va === vb) return true;
  if (!va || !vb) return false;
  return va.chatId === vb.chatId && va.messageId === vb.messageId && va.rev === vb.rev && va.room === vb.room;
}

export const RichText = memo(RichTextInner, sameProps);

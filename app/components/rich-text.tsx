'use client';

import { useMemo } from 'react';
import { RpText } from '@/components/rp-text';
import { HtmlFrame } from '@/components/html-frame';
import { applyRegex, type RegexMacros } from '@/lib/regex-apply';
import { splitRich } from '@/lib/rich-segments';
import { stripMvuBlocks } from '@/lib/mvu';
import type { RegexRule } from '@/lib/resources';

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return `${value.length}-${h}`;
}

// 消息正文：先套「仅显示」正则（玩家规则 + 角色卡自带脚本），再把 HTML 片段交给沙盒渲染。
export function RichText({
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
  variables?: { chatId: number; messageId: number; rev?: string };
}) {
  const shown = useMemo(() => {
    // MVU 的 <UpdateVariable> 命令块只给程序看，不显示（ST 里一般靠卡自带正则藏，没带的卡也别露出来）
    const base = role === 'assistant' ? stripMvuBlocks(text) : text;
    const out = rules?.length ? applyRegex(rules, base, { target: role, purpose: 'display', depth, macros }) : base;
    // 开场白里的 {{user}}/{{char}} 照 ST 显示成名字
    if (!macros || !out.includes('{{')) return out;
    return out.replace(/\{\{char\}\}/gi, macros.char ?? '').replace(/\{\{(?:user|persona)\}\}/gi, macros.user ?? '');
  }, [rules, text, role, depth, macros]);
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
        return <HtmlFrame key={`${index}-${hash(segment.html)}`} html={segment.html} variables={variables ? { chatId: variables.chatId, messageId: variables.messageId, version } : undefined} macros={macros} />;
      })}
    </>
  );
}

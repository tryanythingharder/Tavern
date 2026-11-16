import { Fragment, type ReactNode } from 'react';

// RP 正文排版：把模型输出里的常见写法变成有层次的叙事
//   *动作描写*  → 斜体、弱化的旁白
//   「台词」“台词” "台词" → 强调的对白；『心理』同层级，另加 rp-think
//   ((OOC)) / （（OOC）） → 场外注释，最弱
// 只生成 React 节点，不拼 HTML，避免注入；复制/编辑仍使用原文。

const TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|「[^」\n]*」|『[^』\n]*』|“[^”\n]*”|"[^"\n]*"|\(\([^)\n]*\)\)|（（[^）\n]*））)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyBase}-${index++}`;
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) out.push(<em key={key} className="rp-act">{token.slice(1, -1)}</em>);
    else if (token.startsWith('((') || token.startsWith('（（')) out.push(<span key={key} className="rp-ooc">{token}</span>);
    // 『心理』仍算对白层级（主题样式不变），额外带 rp-think 供用户自定义颜色
    else if (token.startsWith('『')) out.push(<span key={key} className="rp-say rp-think">{token}</span>);
    else out.push(<span key={key} className="rp-say">{token}</span>);
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RpText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((paragraph, p) => {
        const lines = paragraph.split('\n');
        const lastParagraph = p === paragraphs.length - 1;
        return (
          <p key={p} className="rp-p">
            {lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && <br />}
                {inline(line, `${p}-${l}`)}
              </Fragment>
            ))}
            {streaming && lastParagraph && <span className="rp-caret" aria-hidden="true" />}
          </p>
        );
      })}
    </>
  );
}

export function TypingDots({ label = '正在构思' }: { label?: string }) {
  return (
    <span className="rp-typing" role="status" aria-label={label}>
      <i /><i /><i />
      <span className="rp-typing-label">{label}</span>
    </span>
  );
}

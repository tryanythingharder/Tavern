import { activeDict } from '../i18n/runtime';
import { translate, hasHan } from '../i18n/core';

const TEXT_PROPS = ['placeholder', 'title', 'aria-label', 'alt', 'label', 'hint', 'description', 'desc', 'help', 'empty', 'emptyText', 'subtitle', 'caption', 'heading', 'confirmText', 'tooltip', 'aria-description', 'data-tip', 'eyebrow', 'kicker', 'sub', 'note', 'cta'];
const SKIP_TYPES = new Set(['style', 'script', 'textarea', 'code', 'pre']);

function hasHanChild(c: unknown): boolean {
  if (typeof c === 'string') return hasHan(c);
  if (Array.isArray(c)) return c.some(hasHanChild);
  return false;
}

function popcount(n: number) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

function trChildren(children: unknown, dict: Record<string, string>): unknown {
  if (typeof children === 'string') return translate(children, dict);
  if (!Array.isArray(children)) return children;
  // 先整体按「文字 + {n} 占位」查一次，命中就用整句译文（语序正确）
  const parts = children as unknown[];
  if (parts.length > 1 && parts.some((p) => typeof p === 'string' && hasHan(p))) {
    const hanIdx = parts.map((p, i) => (typeof p === 'string' && hasHan(p) ? i : -1)).filter((i) => i >= 0);
    // 先把所有中文片段当文字查整句；不中时依次把部分中文片段当作填空（如「第{一}章」里的数字）
    const masks: number[] = [0];
    if (hanIdx.length <= 4) for (let m = 1; m < 1 << hanIdx.length; m++) masks.push(m);
    masks.sort((a, b) => popcount(a) - popcount(b));
    for (const mask of masks) {
      if (mask === (1 << hanIdx.length) - 1) continue;
      const holeSet = new Set(hanIdx.filter((_i, k) => mask & (1 << k)));
      const holes: unknown[] = [];
      let key = '';
      parts.forEach((p, i) => {
        if (typeof p === 'string' && hasHan(p) && !holeSet.has(i)) key += p;
        else if (typeof p === 'string' && !/[\p{L}\p{N}]/u.test(p)) key += p; // 「 · 」「/」这类纯标点按文字算
        else if (p === null || p === undefined || p === false || p === true || p === '') return;
        else { key += '{' + holes.length + '}'; holes.push(typeof p === 'string' ? translate(p, dict) : p); }
      });
      const whole = translate(key, dict, 0, true);
      if (whole === key) continue;
      const out: unknown[] = [];
      whole.split(/(\{\d+\})/).forEach((seg) => {
        const m = seg.match(/^\{(\d+)\}$/);
        if (m) out.push(holes[Number(m[1])]);
        else if (seg) out.push(seg);
      });
      return out;
    }
  }
  return parts.map((p) => (typeof p === 'string' ? translate(p, dict) : Array.isArray(p) ? trChildren(p, dict) : p));
}

export function translateProps(type: unknown, props: any): any {
  if (!props || typeof props !== 'object') return props;
  const dict = activeDict();
  if (!dict) return props;
  if (props['data-no-i18n'] !== undefined) return props;
  let next: any = null;
  if (!(typeof type === 'string' && SKIP_TYPES.has(type)) && hasHanChild(props.children)) {
    next = { ...props, children: trChildren(props.children, dict) };
  }
  for (const k of TEXT_PROPS) {
    const v = props[k];
    if (typeof v === 'string' && hasHan(v)) {
      if (!next) next = { ...props };
      next[k] = translate(v, dict);
    }
  }
  return next ?? props;
}

// 运行时界面翻译：源码里的中文就是词条键，en.json 给出英文。
// 由自定义 JSX 运行时（lib/jsx）在渲染时替换文本子节点与少数文本属性，
// 因此组件里的中文不用逐个改成 t()；非 JSX 场景（alert、document.title、元数据）用 tr()。
export type Locale = 'zh' | 'en';
export type Dict = Record<string, string>;

export const LOCALE_COOKIE = 'tavern_lang';
const HAN = /[\u4e00-\u9fff]/;

type Pattern = { re: RegExp; out: string; hint: string; hanOk: boolean[] };
type Compiled = { exact: Map<string, string>; patterns: Pattern[] };
let compiledFor: Dict | null = null;
let compiled: Compiled = { exact: new Map(), patterns: [] };

const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function compile(dict: Dict): Compiled {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [k, v] of Object.entries(dict)) {
    if (k.startsWith('§')) { exact.set(k, v); continue; }
    if (/\{\d+\}/.test(k)) {
      exact.set('§' + k, v);
      if (!HAN.test(k.replace(/\{\d+\}/g, ''))) continue;
      const parts = k.split(/\{\d+\}/);
      const hint = parts.reduce((a, b) => (b.length > a.length ? b : a), '').trim();
      const order: number[] = [];
      const hanOk: boolean[] = [];
      const DELIM = /[\s「」『』“”"'（）()：:·、，,。.!！?？【】\[\]#@\/<>《》+\-—…]/;
      k.replace(/\{\d+\}/g, (m, at: number) => {
        const before = at === 0 ? '' : k[at - 1];
        const after = k[at + m.length] ?? '';
        // 占位两侧紧贴汉字时（如「角色{0}」），不接受汉字填充，避免把「角色卡」误拆
        hanOk.push((!before || DELIM.test(before)) && (!after || DELIM.test(after) || after === '{'));
        return m;
      });
      const src = k.replace(/\{(\d+)\}|([^{]+|\{)/g, (_m, n, lit) => {
        if (n !== undefined) { order.push(Number(n)); return '([\\s\\S]*?)'; }
        return esc(lit);
      });
      // 输出里 {n} 对应键里第 n 个占位，用捕获顺序映射回去
      let out = v;
      patterns.push({ re: new RegExp('^' + src + '$'), out: JSON.stringify(order) + '\u0000' + out, hint, hanOk });
    } else exact.set(k, v);
  }
  patterns.sort((a, b) => b.hint.length - a.hint.length);
  return { exact, patterns };
}

export function hasHan(s: string) { return HAN.test(s); }

export function translate(input: string, dict: Dict | null | undefined, depth = 0, exactOnly = false): string {
  if (!dict || !input || !HAN.test(input)) return input;
  if (compiledFor !== dict) { compiled = compile(dict); compiledFor = dict; }
  const raw = norm(input);
  let key = raw;
  // 「2.1 万」这类中文计数先换成 21k，再查词条
  key = key.replace(/(\d+(?:\.\d+)?)\s*万/g, (_m, n) => { const v = Number(n) * 10; return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'M' : v.toFixed(1).replace(/\.0$/, '') + 'k'; });
  const lead = input.match(/^\s*/)![0];
  const tail = key ? input.match(/\s*$/)![0] : '';
  if (!HAN.test(key)) return lead + key + tail;
  const hit = compiled.exact.get(key);
  if (hit !== undefined) return lead + hit + tail;
  if (exactOnly) { const c = compiled.exact.get('§' + key); return c !== undefined ? lead + c + tail : input; }
  // 走到这里还没命中：先试试不带 § 的组合键（同时也是普通模板的键）
  if (depth > 2) return input;
  // 「名称、剧情钩子」「克制 · 慢热」这类拼接短语：每段都有词条才整体翻译
  for (const [sep, join] of [['、', ', '], [' · ', ' · ']] as const) {
    if (!key.includes(sep) || /[{}]/.test(key)) continue;
    const outParts = key.split(sep).map((x) => (HAN.test(x) ? translate(x, dict, depth + 1) : x));
    if (outParts.every((x) => !HAN.test(x))) return lead + outParts.join(join) + tail;
  }
  for (const p of compiled.patterns) {
    if (p.hint && !key.includes(p.hint)) continue;
    const m = key.match(p.re);
    if (!m) continue;
    const [orderJson, out] = p.out.split('\u0000');
    const order: number[] = JSON.parse(orderJson);
    const caps: Record<number, string> = {};
    order.forEach((n, i) => { caps[n] = translate(m[i + 1], dict, depth + 1); });
    return lead + out.replace(/\{(\d+)\}/g, (_x, n) => caps[Number(n)] ?? '') + tail;
  }
  return key !== raw ? lead + key + tail : input;
}

// MVU（MagVarUpdate）变量兼容：很多热门卡靠它记录好感度、金钱、时间、地点这类状态。
//   初始值：卡内世界书里标题含 [InitVar] 的条目（JSON 或 YAML），多条合并
//   更新：模型回复里的 <UpdateVariable> 命令，_.set / _.add / _.insert / _.remove（含 MVU 的 [值, "说明"] 写法），
//         以及新版的 <JSONPatch>[{op, path, value}]</JSONPatch>
//   取值：提示词宏 {{get_message_variable::stat_data.x}} / {{format_message_variable::…}} / {{getvar::…}}；
//         状态栏脚本在沙盒里通过 getVariables() / Mvu.getMvuData() 读（public/sandbox/frame.html）
// 变量不单独落库：每次从初始值按楼层顺序重放各条回复（当前选中的候选）里的命令。
// 这样切换候选、编辑、删除、分支都自动正确，和 ST 里「变量跟着楼层走」的效果一致。

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export type MvuState = { stat_data: Obj; display_data: Obj; delta_data: Obj; /** 酒馆助手脚本写的聊天/全局变量（lib/helper-vars.ts），宏也能读 */ scoped?: { chat?: Record<string, unknown>; global?: Record<string, unknown> }; /** ST 变量宏写回给谁（lib/st-vars.ts） */ owner?: { userId: number; chatScopeId: string } };

// ---------- JS 字面量解析（命令参数）----------
class Reader {
  i = 0;
  constructor(public s: string) {}
  ws() {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (/\s/.test(c)) this.i += 1;
      else if (this.s.startsWith('//', this.i)) { const n = this.s.indexOf('\n', this.i); this.i = n < 0 ? this.s.length : n; }
      else if (this.s.startsWith('/*', this.i)) { const n = this.s.indexOf('*/', this.i + 2); this.i = n < 0 ? this.s.length : n + 2; }
      else break;
    }
  }
  peek() { this.ws(); return this.s[this.i]; }
  string(): string {
    const quote = this.s[this.i];
    this.i += 1;
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== quote) {
      let c = this.s[this.i];
      if (c === '\\' && this.i + 1 < this.s.length) {
        this.i += 1;
        const e = this.s[this.i];
        c = e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e;
      }
      out += c;
      this.i += 1;
    }
    this.i += 1;
    return out;
  }
  value(stops = ',)]}'): Json {
    const c = this.peek();
    if (c === undefined) return null;
    if (c === '"' || c === "'" || c === '`') return this.string();
    if (c === '[') {
      this.i += 1;
      const list: Json[] = [];
      while (this.peek() !== undefined && this.peek() !== ']') {
        list.push(this.value(',]'));
        if (this.peek() === ',') this.i += 1;
      }
      this.i += 1;
      return list;
    }
    if (c === '{') {
      this.i += 1;
      const obj: Obj = {};
      while (this.peek() !== undefined && this.peek() !== '}') {
        const k = this.peek();
        let key: string;
        if (k === '"' || k === "'" || k === '`') key = this.string();
        else { const start = this.i; while (this.i < this.s.length && !/[:\s,}]/.test(this.s[this.i])) this.i += 1; key = this.s.slice(start, this.i); }
        if (this.peek() === ':') this.i += 1;
        obj[key] = this.value(',}');
        if (this.peek() === ',') this.i += 1;
      }
      this.i += 1;
      return obj;
    }
    // 裸值：数字、true/false/null，或没加引号的文字
    const start = this.i;
    let depth = 0;
    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === '(') depth += 1;
      else if (ch === ')' && depth) depth -= 1;
      else if (!depth && stops.includes(ch)) break;
      this.i += 1;
    }
    return scalar(this.s.slice(start, this.i).trim());
  }
}

function scalar(raw: string): Json {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === 'undefined' || raw === '~' || raw === '') return raw === '' ? '' : null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(raw)) return Number(raw);
  return raw;
}

// ---------- YAML 子集（InitVar 常用 YAML）----------
function stripComment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function yamlScalar(raw: string): Json {
  const text = raw.trim();
  if (!text) return null;
  if (text[0] === '[' || text[0] === '{') {
    const r = new Reader(text);
    return r.value();
  }
  if ((text[0] === '"' && text.endsWith('"')) || (text[0] === "'" && text.endsWith("'"))) {
    if (text[0] === '"') { try { return JSON.parse(text) as string; } catch { /* 落到下面 */ } }
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return scalar(text);
}

export function parseYaml(source: string): Json {
  const lines = source.replace(/\t/g, '  ').split(/\r?\n/)
    .map((line) => stripComment(line).replace(/\s+$/, ''))
    .filter((line) => line.trim() && !/^\s*(---|\.\.\.)\s*$/.test(line));
  let index = 0;
  const indentOf = (line: string) => line.length - line.trimStart().length;

  function block(indent: number): Json {
    if (index >= lines.length) return null;
    const first = lines[index].trim();
    if (first.startsWith('- ') || first === '-') {
      const list: Json[] = [];
      while (index < lines.length && indentOf(lines[index]) === indent && /^-(\s|$)/.test(lines[index].trim())) {
        const rest = lines[index].trim().slice(1).trim();
        if (!rest) { index += 1; list.push(index < lines.length && indentOf(lines[index]) > indent ? block(indentOf(lines[index])) : null); continue; }
        if (/^[^"'[{][^:]*:(\s|$)/.test(rest) || /^["'][^"']+["']\s*:(\s|$)/.test(rest)) {
          // "- key: value" 开头的对象：把这一行改写成更深缩进的键值
          const inner = indent + 2;
          lines[index] = ' '.repeat(inner) + rest;
          list.push(block(inner));
          continue;
        }
        index += 1;
        list.push(yamlScalar(rest));
      }
      return list;
    }
    const obj: Obj = {};
    while (index < lines.length && indentOf(lines[index]) === indent) {
      const line = lines[index].trim();
      const m = line.match(/^("([^"]*)"|'([^']*)'|[^:]+?)\s*:(\s+(.*))?$/);
      if (!m) { index += 1; continue; }
      const key = m[2] ?? m[3] ?? m[1].trim();
      const rest = (m[5] ?? '').trim();
      index += 1;
      if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
        const parts: string[] = [];
        while (index < lines.length && indentOf(lines[index]) > indent) { parts.push(lines[index].trim()); index += 1; }
        obj[key] = parts.join(rest.startsWith('|') ? '\n' : ' ');
      } else if (rest) obj[key] = yamlScalar(rest);
      else if (index < lines.length && indentOf(lines[index]) > indent) obj[key] = block(indentOf(lines[index]));
      else if (index < lines.length && indentOf(lines[index]) === indent && /^-(\s|$)/.test(lines[index].trim())) obj[key] = block(indent);
      else obj[key] = null;
    }
    return obj;
  }
  return lines.length ? block(indentOf(lines[0])) : null;
}

function parseData(text: string): Json {
  const body = text.trim().replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  if (!body) return null;
  if (body[0] === '{' || body[0] === '[') {
    try { return JSON.parse(body) as Json; } catch { /* 宽松 JSON 交给字面量解析 */ }
    try { return new Reader(body).value(); } catch { /* 再试 YAML */ }
  }
  try { return parseYaml(body); } catch { return null; }
}

// ---------- 路径 ----------
export function toPath(path: string): string[] {
  const out: string[] = [];
  const re = /\[\s*(?:"([^"]*)"|'([^']*)'|([^\]]*))\s*\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) out.push((m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim());
  if (out[0] === 'stat_data') out.shift();
  return out.filter((part) => part !== '');
}

function getIn(root: Json, parts: string[]): Json | undefined {
  let cur: Json | undefined = root;
  for (const part of parts) {
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (isObj(cur)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

function parentOf(root: Obj, parts: string[], create: boolean): { holder: Obj | Json[]; key: string } | null {
  let cur: Json = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    let next: Json | undefined = Array.isArray(cur) ? cur[Number(part)] : isObj(cur) ? cur[part] : undefined;
    if (next === undefined || next === null || typeof next !== 'object') {
      if (!create) return null;
      next = /^\d+$/.test(parts[i + 1]) ? [] : {};
      if (Array.isArray(cur)) cur[Number(part)] = next;
      else if (isObj(cur)) cur[part] = next;
      else return null;
    }
    cur = next;
  }
  if (!cur || typeof cur !== 'object') return null;
  return { holder: cur as Obj | Json[], key: parts[parts.length - 1] };
}

// MVU 的 [值, "说明"]：改值只改第 0 位
const described = (value: Json | undefined): value is [Json, string] =>
  Array.isArray(value) && value.length === 2 && typeof value[1] === 'string' && !Array.isArray(value[0]) && !isObj(value[0]);

function coerce(next: Json, old: Json | undefined): Json {
  if (typeof old === 'number' && typeof next === 'string' && /^[-+]?\d+(\.\d+)?$/.test(next.trim())) return Number(next);
  return next;
}

function show(value: Json | undefined): string {
  if (value === undefined) return '';
  if (described(value)) return show(value[0]);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

type Change = { path: string; before: Json | undefined; after: Json | undefined };

function setPath(root: Obj, parts: string[], value: Json): Change | null {
  if (!parts.length) return null;
  const ref = parentOf(root, parts, true);
  if (!ref) return null;
  const holder = ref.holder as Record<string, Json>;
  const old = holder[ref.key];
  if (described(old) && !Array.isArray(value)) {
    const before = old[0];
    old[0] = coerce(value, before);
    return { path: parts.join('.'), before, after: old[0] };
  }
  holder[ref.key] = coerce(value, old);
  return { path: parts.join('.'), before: old, after: holder[ref.key] };
}

function addPath(root: Obj, parts: string[], delta: Json): Change | null {
  const old = getIn(root, parts);
  const base = described(old) ? old[0] : old;
  if (Array.isArray(base)) { base.push(delta); return { path: parts.join('.'), before: undefined, after: delta }; }
  const amount = typeof delta === 'number' ? delta : Number(delta);
  if (!Number.isFinite(amount)) return null;
  const start = typeof base === 'number' ? base : Number(base) || 0;
  return setPath(root, parts, Math.round((start + amount) * 1e6) / 1e6);
}

function insertPath(root: Obj, parts: string[], args: Json[]): Change | null {
  const target = getIn(root, parts);
  if (args.length >= 2) {
    const [key, value] = args;
    if (Array.isArray(target)) { target.splice(Number(key), 0, value); return { path: parts.join('.'), before: undefined, after: value }; }
    if (isObj(target)) { target[String(key)] = value; return { path: [...parts, String(key)].join('.'), before: undefined, after: value }; }
    return setPath(root, [...parts, String(key)], value);
  }
  const value = args[0] ?? null;
  if (Array.isArray(target)) { target.push(value); return { path: parts.join('.'), before: undefined, after: value }; }
  if (isObj(target) && isObj(value)) { Object.assign(target, value); return { path: parts.join('.'), before: undefined, after: value }; }
  return setPath(root, parts, value);
}

function removePath(root: Obj, parts: string[], arg?: Json): Change | null {
  if (arg !== undefined) {
    const target = getIn(root, parts);
    if (Array.isArray(target)) {
      const at = typeof arg === 'number' ? arg : target.findIndex((item) => JSON.stringify(item) === JSON.stringify(arg));
      if (at < 0 || at >= target.length) return null;
      const [gone] = target.splice(at, 1);
      return { path: parts.join('.'), before: gone, after: undefined };
    }
    if (isObj(target)) { const key = String(arg); const gone = target[key]; delete target[key]; return { path: [...parts, key].join('.'), before: gone, after: undefined }; }
    return null;
  }
  const ref = parentOf(root, parts, false);
  if (!ref) return null;
  if (Array.isArray(ref.holder)) { const [gone] = ref.holder.splice(Number(ref.key), 1); return { path: parts.join('.'), before: gone, after: undefined }; }
  const gone = ref.holder[ref.key];
  delete ref.holder[ref.key];
  return { path: parts.join('.'), before: gone, after: undefined };
}

// ---------- 命令 ----------
const CALL_RE = /_\.(set|add|insert|assign|remove|unset|delete)\s*\(/g;
const BLOCK_RE = /<(UpdateVariable|update_variable|JSONPatch|json_patch)>([\s\S]*?)<\/\1>/gi;

export function hasMvuCommands(text: string): boolean {
  return /_\.(set|add|insert|assign|remove|unset|delete)\s*\(|<JSONPatch>|<json_patch>/i.test(text);
}

function applyText(stat: Obj, text: string, changes: Change[]) {
  // 只认 <UpdateVariable>/<JSONPatch> 块里的命令；没有块时整条回复里找（老卡常不包块）
  const blocks: { kind: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(text))) blocks.push({ kind: m[1].toLowerCase(), body: m[2] });
  if (!blocks.length) blocks.push({ kind: 'updatevariable', body: text });
  for (const block of blocks) {
    const patch = /json_?patch/.test(block.kind) ? parseData(block.body) : null;
    if (Array.isArray(patch)) { applyPatch(stat, patch, changes); continue; }
    // UpdateVariable 块里也可能放 JSONPatch
    const inner = block.body.match(/<(JSONPatch|json_patch)>([\s\S]*?)<\/\1>/i);
    if (inner) { const list = parseData(inner[2]); if (Array.isArray(list)) applyPatch(stat, list, changes); }
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(block.body))) {
      const reader = new Reader(block.body);
      reader.i = m.index + m[0].length;
      const args: Json[] = [];
      let guard = 0;
      while (reader.peek() !== undefined && reader.peek() !== ')' && guard < 8) {
        args.push(reader.value(',)'));
        if (reader.peek() === ',') reader.i += 1;
        guard += 1;
      }
      CALL_RE.lastIndex = Math.max(reader.i, m.index + m[0].length);
      const path = typeof args[0] === 'string' ? toPath(args[0]) : [];
      if (!path.length) continue;
      let change: Change | null = null;
      switch (m[1]) {
        case 'set': change = setPath(stat, path, args.length >= 3 ? args[2] : args[1] ?? null); break;
        case 'add': change = addPath(stat, path, args[1] ?? 0); break;
        case 'insert': case 'assign': change = insertPath(stat, path, args.slice(1)); break;
        default: change = removePath(stat, path, args[1]);
      }
      if (change) changes.push(change);
    }
  }
}

function applyPatch(stat: Obj, ops: Json[], changes: Change[]) {
  for (const op of ops) {
    if (!isObj(op) || typeof op.path !== 'string') continue;
    const parts = op.path.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~')).filter((p) => p !== '-');
    const appendEnd = op.path.endsWith('/-');
    if (parts[0] === 'stat_data') parts.shift();
    if (!parts.length) continue;
    let change: Change | null = null;
    switch (op.op) {
      case 'replace': change = setPath(stat, parts, op.value ?? null); break;
      case 'add': case 'insert':
        change = appendEnd ? insertPath(stat, parts, [op.value ?? null]) : setPath(stat, parts, op.value ?? null); break;
      case 'delta': change = addPath(stat, parts, op.value ?? 0); break;
      case 'remove': change = removePath(stat, parts); break;
      default: break;
    }
    if (change) changes.push(change);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function deepMerge(into: Obj, from: Obj) {
  for (const [key, value] of Object.entries(from)) {
    if (isObj(value) && isObj(into[key])) deepMerge(into[key] as Obj, value);
    else into[key] = clone(value);
  }
}

// display_data：本楼改过的地方写成「旧->新」，其余照抄（和 MVU 一样，状态栏常拿它显示变化）
function displayOf(stat: Obj, changes: Change[]): { display: Obj; delta: Obj } {
  const display = clone(stat);
  const delta: Obj = {};
  for (const change of changes) {
    const parts = toPath(change.path);
    const text = change.before === undefined ? show(change.after) : change.after === undefined ? `${show(change.before)}->(已删除)` : `${show(change.before)}->${show(change.after)}`;
    const ref = parentOf(display, parts, true);
    if (ref && change.after !== undefined) {
      const holder = ref.holder as Record<string, Json>;
      if (described(holder[ref.key])) (holder[ref.key] as Json[])[0] = text;
      else holder[ref.key] = text;
    }
    const dref = parentOf(delta, parts, true);
    if (dref) (dref.holder as Record<string, Json>)[dref.key] = text;
  }
  return { display, delta };
}

// ---------- 对外 ----------
export function initialStat(entries: { title: string; text: string }[]): Obj {
  const stat: Obj = {};
  for (const entry of entries) {
    if (!/init_?var/i.test(entry.title)) continue;
    const data = parseData(entry.text);
    if (isObj(data)) deepMerge(stat, isObj(data.stat_data) ? data.stat_data : data);
  }
  return stat;
}

export type Floor = { id: number; role: string; content: string };

// 从头重放到 uptoId（含）为止，返回该楼层之后的变量；uptoId 省略 = 最新
export function replay(initial: Obj, floors: Floor[], uptoId?: number): MvuState & { index: number; active: boolean } {
  const stat = clone(initial);
  let changes: Change[] = [];
  let index = -1;
  let active = Object.keys(initial).length > 0;
  for (const floor of floors) {
    if (uptoId !== undefined && floor.id > uptoId) break;
    index += 1;
    if (floor.role !== 'assistant') continue;
    if (!hasMvuCommands(floor.content)) { changes = []; continue; }
    active = true;
    changes = [];
    applyText(stat, floor.content, changes);
  }
  const { display, delta } = displayOf(stat, changes);
  return { stat_data: stat, display_data: display, delta_data: delta, index, active };
}

function formatValue(value: Json | undefined, pretty: boolean): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

// 提示词宏：{{get_message_variable::stat_data.好感度}}、{{format_message_variable::stat_data}}、{{getvar::…}}
export function resolveVariableMacros(text: string, state: MvuState | null): string {
  if (!state || !text.includes('{{')) return text;
  const root: Obj = { stat_data: state.stat_data, display_data: state.display_data, delta_data: state.delta_data };
  return text.replace(
    /\{\{\s*(get|format)_(message|chat|global)_variable::([^}]+)\}\}|\{\{\s*get(global)?var::([^}]+)\}\}/gi,
    (_match, kind: string | undefined, scope: string | undefined, a: string | undefined, isGlobal: string | undefined, b: string | undefined) => {
      const raw = (a ?? b ?? '').trim();
      const pretty = kind?.toLowerCase() === 'format';
      // 聊天/全局变量（脚本写的）优先；没有再按 MVU 的 stat_data 找
      const bucket = isGlobal || scope?.toLowerCase() === 'global' ? state.scoped?.global : scope?.toLowerCase() === 'message' ? undefined : state.scoped?.chat;
      if (bucket) {
        const hit = getIn(bucket as unknown as Json, toPathRaw(raw));
        if (hit !== undefined) return formatValue(unwrapDescribed(hit), pretty);
      }
      const parts = toPathRaw(raw);
      if (!/^(stat_data|display_data|delta_data)$/.test(parts[0] ?? '')) parts.unshift('stat_data');
      return formatValue(unwrapDescribed(getIn(root, parts)), pretty);
    },
  );
}

// MVU 常把变量写成 [值, "说明"]；宏只要值本身（和 Mvu.getMvuVariable 一致）
function unwrapDescribed(value: Json | undefined): Json | undefined {
  return Array.isArray(value) && value.length === 2 && typeof value[1] === 'string' ? value[0] : value;
}

function toPathRaw(path: string): string[] {
  const out: string[] = [];
  const re = /\[\s*(?:"([^"]*)"|'([^']*)'|([^\]]*))\s*\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) out.push((m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim());
  return out.filter(Boolean);
}

// 展示时藏掉变量命令块（生成中块还没闭合也藏）
export function stripMvuBlocks(text: string): string {
  if (!/<(UpdateVariable|update_variable|JSONPatch|json_patch)>/i.test(text)) return text;
  return text
    .replace(/<(UpdateVariable|update_variable|JSONPatch|json_patch)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(UpdateVariable|update_variable|JSONPatch|json_patch)>[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

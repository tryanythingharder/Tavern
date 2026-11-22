// ST 变量宏（Variables）：聊天变量（chat_metadata.variables）与全局变量（extension_settings.variables.global）。
// 和酒馆助手 getVariables({type:'chat'|'global'}) 读写同一份（lib/helper-vars.ts），这点与 ST 一致。
//   {{setvar::name::value}}  {{addvar::name::value}}  → 空
//   {{incvar::name}} {{decvar::name}}                 → 新值
//   {{getvar::name}}                                   → 值（没有这个变量时留给 MVU 宏解析，见 lib/mvu.ts）
//   以及 *globalvar 同名一套。宏按文本从左到右执行；提示词组装完后有改动才落库。
type Obj = Record<string, unknown>;

export type VarStore = {
  chat: Obj;
  global: Obj;
  dirty: { chat: boolean; global: boolean };
};

export function makeVarStore(scoped?: { chat?: Obj; global?: Obj } | null): VarStore {
  return { chat: { ...(scoped?.chat ?? {}) }, global: { ...(scoped?.global ?? {}) }, dirty: { chat: false, global: false } };
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

// ST addVariable：数组 → push；两边都是数字 → 相加；否则字符串拼接
export function addValue(current: unknown, value: string): unknown {
  if (Array.isArray(current)) return [...current, value];
  if (typeof current === 'string' && /^\s*\[/.test(current)) {
    try {
      const list = JSON.parse(current) as unknown;
      if (Array.isArray(list)) return JSON.stringify([...list, value]);
    } catch {
      /* 不是 JSON 数组就当字符串 */
    }
  }
  if ((current === undefined || current === '' || isNumeric(current)) && isNumeric(value)) return Number(current || 0) + Number(value);
  return asText(current) + value;
}

export type VarOp = 'set' | 'add' | 'inc' | 'dec' | 'get' | 'flush' | 'has';

// 一次变量操作（宏和斜杠命令共用），返回宏/命令的输出
export function varOp(store: VarStore, scope: 'chat' | 'global', op: VarOp, name: string, value = ''): string {
  const bucket = store[scope];
  const key = name.trim();
  if (!key) return '';
  switch (op) {
    case 'get':
      return asText(bucket[key]);
    case 'has':
      return key in bucket ? 'true' : 'false';
    case 'set':
      bucket[key] = value;
      break;
    case 'add':
      bucket[key] = addValue(bucket[key], value);
      break;
    case 'inc':
    case 'dec': {
      const next = (isNumeric(bucket[key]) ? Number(bucket[key]) : 0) + (op === 'inc' ? 1 : -1);
      bucket[key] = next;
      store.dirty[scope] = true;
      return String(next);
    }
    case 'flush':
      if (!(key in bucket)) return '';
      delete bucket[key];
      break;
  }
  store.dirty[scope] = true;
  return '';
}

const MACRO = /\{\{\s*(set|add|inc|dec|get|has)(global)?var::([^}]*?)\s*\}\}/gi;

export function applyStVarMacros(text: string, store: VarStore | null | undefined): string {
  if (!store || !text || !text.includes('{{')) return text;
  return text.replace(MACRO, (match, verb: string, global: string | undefined, body: string) => {
    const op = verb.toLowerCase() as VarOp;
    const scope = global ? 'global' : 'chat';
    const split = body.indexOf('::');
    const name = split >= 0 ? body.slice(0, split) : body;
    const value = split >= 0 ? body.slice(split + 2) : '';
    // getvar 没命中：留给 MVU 宏按 stat_data 找（MVU 卡常写 {{getvar::stat_data.好感度}}）
    if (op === 'get' && !(name.trim() in store[scope])) return match;
    return varOp(store, scope, op, name, value);
  });
}

/** 落库用：谁的变量（chat scope_id = 会话 id，群聊 room:房间 id） */
export type VarOwner = { userId: number; chatScopeId: string };

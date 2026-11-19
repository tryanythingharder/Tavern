// 自动包装：QuickJS 沙盒里跑的 EJS 引擎源码（改这里即可，不要出现反引号和 ${）
/* eslint-disable */
export const EJS_RUNTIME = String.raw`
// 在 QuickJS 沙盒里运行的 EJS 引擎（兼容 ST-Prompt-Template 的常用写法）。
// 由 lib/ejs.ts 以字符串形式载入；这里没有 Node、没有网络、没有文件，只有宿主传进来的 JSON 数据。
var __D = null;
var __sets = [];
var __errors = [];
var __defs = {};
var __depth = 0;

function __str(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}
function __escHtml(v) {
  return __str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- 路径读写（lodash _.get/_.set 的子集，沙盒里不一定载了 lodash） ----
function __path(key) {
  if (Array.isArray(key)) return key.map(String);
  var out = [];
  String(key).replace(/\[(?:'([^']*)'|"([^"]*)"|([^\]]*))\]|([^.[\]]+)/g, function (_m, a, b, c, d) {
    out.push(a !== undefined ? a : b !== undefined ? b : c !== undefined ? c : d);
    return '';
  });
  return out;
}
function __get(obj, key) {
  if (key === null || key === undefined || key === '') return obj;
  var parts = __path(key), cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}
function __has(obj, key) {
  var parts = __path(key), cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || !(parts[i] in cur)) return false;
    cur = cur[parts[i]];
  }
  return true;
}
function __set(obj, key, value) {
  var parts = __path(key), cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var next = cur[parts[i]];
    if (next === null || typeof next !== 'object') { next = /^\d+$/.test(parts[i + 1]) ? [] : {}; cur[parts[i]] = next; }
    cur = next;
  }
  if (parts.length) cur[parts[parts.length - 1]] = value;
}
function __del(obj, key) {
  var parts = __path(key), cur = obj;
  for (var i = 0; i < parts.length - 1; i++) { if (!cur || typeof cur !== 'object') return; cur = cur[parts[i]]; }
  if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
}
function __clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function __merge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  var out = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  for (var k in b) out[k] = __merge(out[k], b[k]);
  return out;
}

// ---- 变量：global / local(聊天) / message(MVU 等本楼变量)；cache = 三者合并（message 优先） ----
function __scopes() { return __D.vars; }
function __cache() {
  var s = __scopes();
  return __merge(__merge(__merge({}, __clone(s.global) || {}), __clone(s.local) || {}), __clone(s.message) || {});
}
function __opts(o) { return typeof o === 'string' ? { flags: o } : (o || {}); }
function __bucket(scope) {
  var s = __scopes();
  if (scope === 'global') return s.global;
  if (scope === 'local') return s.local;
  if (scope === 'message') return s.message;
  if (scope === 'initial') return s.initial || {};
  return null;
}
function __canWrite(o) { return __D.persist || o.dryRun === true; }

function getvar(key, options) {
  var o = __opts(options);
  var scope = o.scope || 'cache';
  var tree = scope === 'cache' ? __cache() : __bucket(scope);
  var v = __get(tree, key);
  if (v === undefined) return o.defaults;
  return o.clone ? __clone(v) : v;
}
function setvar(key, value, options) {
  var o = __opts(options);
  var scope = o.scope || 'message';
  var tree = __bucket(scope) || __scopes().message;
  var exists = __has(tree, key);
  var flags = o.flags || 'n';
  if ((flags === 'nx' || flags === 'nxs') && exists) return undefined;
  if ((flags === 'xx' || flags === 'xxs') && !exists) return undefined;
  var old = __get(tree, key);
  var next = o.merge && old && typeof old === 'object' ? __merge(__clone(old), value) : value;
  // 准备阶段（生成提示词）默认不写，和 ST-Prompt-Template 一样，避免每次生成都重复累加
  if (!__canWrite(o)) return o.results === 'old' ? old : next;
  __set(tree, key, __clone(next));
  __sets.push({ op: 'set', scope: scope, key: __path(key), value: __clone(next) });
  return o.results === 'old' ? old : next;
}
function delvar(key, options) {
  var o = __opts(options);
  var scope = o.scope || 'message';
  if (!__canWrite(o)) return;
  __del(__bucket(scope) || __scopes().message, key);
  __sets.push({ op: 'del', scope: scope, key: __path(key) });
}
function incvar(key, value, options) {
  var o = __opts(options);
  var by = value === undefined ? 1 : Number(value);
  var cur = Number(getvar(key, { scope: o.inscope || 'cache', defaults: o.defaults === undefined ? 0 : o.defaults })) || 0;
  var next = cur + by;
  if (o.min !== undefined && o.min !== null) next = Math.max(o.min, next);
  if (o.max !== undefined && o.max !== null) next = Math.min(o.max, next);
  return setvar(key, next, { scope: o.outscope || 'message', flags: o.flags, results: o.results, dryRun: o.dryRun });
}
function decvar(key, value, options) { return incvar(key, -(value === undefined ? 1 : Number(value)), options); }
function insvar(key, value, index, options) {
  var o = __opts(options);
  var arr = getvar(key, { scope: o.inscope || 'cache', clone: true });
  if (!Array.isArray(arr)) arr = arr === undefined ? [] : [arr];
  if (index === undefined || index === null) arr.push(value); else arr.splice(index, 0, value);
  return setvar(key, arr, { scope: o.outscope || 'message', dryRun: o.dryRun });
}
function __scoped(fn, scope) { return function (a, b, c, d) { var o = typeof b === 'object' && fn === getvar ? b : undefined; return fn === getvar ? getvar(a, Object.assign({}, __opts(b), { scope: scope })) : fn === setvar ? setvar(a, b, Object.assign({}, __opts(c), { scope: scope })) : fn === delvar ? delvar(a, Object.assign({}, __opts(b), { scope: scope })) : fn === insvar ? insvar(a, b, c, Object.assign({}, __opts(d), { inscope: scope, outscope: scope })) : fn(a, b, Object.assign({}, __opts(c), { inscope: scope, outscope: scope })); }; }
var getLocalVar = __scoped(getvar, 'local'), getGlobalVar = __scoped(getvar, 'global'), getMessageVar = __scoped(getvar, 'message');
var setLocalVar = __scoped(setvar, 'local'), setGlobalVar = __scoped(setvar, 'global'), setMessageVar = __scoped(setvar, 'message');
var delLocalVar = __scoped(delvar, 'local'), delGlobalVar = __scoped(delvar, 'global'), delMessageVar = __scoped(delvar, 'message');
var incLocalVar = __scoped(incvar, 'local'), incGlobalVar = __scoped(incvar, 'global'), incMessageVar = __scoped(incvar, 'message');
var decLocalVar = __scoped(decvar, 'local'), decGlobalVar = __scoped(decvar, 'global'), decMessageVar = __scoped(decvar, 'message');
var insertLocalVar = __scoped(insvar, 'local'), insertGlobalVar = __scoped(insvar, 'global'), insertMessageVar = __scoped(insvar, 'message');
function allVariables() { return __cache(); }
function patchVariables() {}
function setVariableSchema() {}
function saveVariables() { return Promise.resolve(); }

// ---- 世界书 / 角色 / 楼层 ----
function __findEntry(book, title) {
  var list = __D.lore || [];
  var t = title;
  var hit = null;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (book && e.book && e.book !== book && book !== __D.charLoreBook) continue;
    if (t instanceof RegExp ? (t.test(e.title) || t.test(e.uid)) : (e.title === String(t) || e.uid === String(t))) { hit = e; break; }
  }
  return hit;
}
async function getwi(a, b, c) {
  var book = null, title = a, data = b;
  if (b !== undefined && (typeof b === 'string' || typeof b === 'number' || b instanceof RegExp)) { book = a; title = b; data = c; }
  var e = __findEntry(book, title);
  if (!e) return '';
  return __render(e.content, data || {}, { name: 'getwi:' + e.title });
}
var getWorldInfo = getwi;
async function getchar(name, template, data) {
  var c = __D.char || {};
  var tpl = template || '<% if (name) { %><%- name %><% } %>\n<% if (description) { %><%- description %>\n<% } %><% if (personality) { %><%- personality %>\n<% } %><% if (scenario) { %><%- scenario %>\n<% } %>';
  return __render(tpl, Object.assign({}, c, data || {}), { name: 'getchar' });
}
var getChara = getchar;
async function getpreset() { return ''; }
var getPresetPrompt = getpreset;
async function getqr() { return ''; }
var getQuickReply = getqr;
function getChatMessages(a, b, c) {
  var list = __D.messages || [];
  var role, start, end;
  if (typeof b === 'string' || b === undefined) { role = b; start = Math.max(0, list.length - (a || list.length)); end = list.length - 1; }
  else { start = a < 0 ? list.length + a : a; end = b < 0 ? list.length + b : b; role = c; }
  var out = [];
  for (var i = Math.max(0, start); i <= Math.min(end, list.length - 1); i++) if (!role || list[i].role === role) out.push(list[i].content);
  return out;
}
function getChatMessage(idx, role) {
  var list = (__D.messages || []).filter(function (m) { return !role || m.role === role; });
  var i = idx < 0 ? list.length + idx : idx;
  return list[i] ? list[i].content : '';
}
function matchChatMessages(pattern) {
  var re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
  return (__D.messages || []).some(function (m) { return re.test(m.content); });
}
function parseJSON(text) { try { return JSON.parse(text); } catch (e) { return undefined; } }
function jsonPatch(doc) { return doc; }
function define(name, value) { __defs[name] = value; globalThis[name] = value; }
function print() {}
// 下面这些在平台里没有对应能力：可调用但不做事
function activewi() { return Promise.resolve(false); }
var activateWorldInfo = activewi, activateWorldInfoByKeywords = activewi, refreshWorldInfo = activewi, getEnabledWorldInfoEntries = function () { return Promise.resolve([]); };
function injectPrompt() {}
function getPromptsInjected() { return []; }
function hasPromptsInjected() { return false; }
function activateRegex() {}
function getFeatures() { return {}; }
function setFeatures() {}
function resetFeatures() {}
function execute() { return Promise.resolve(''); }

// ---- 编译 ----
function __compile(tpl) {
  tpl = String(tpl).replace(/<#escape-ejs>([\s\S]*?)<#\/escape-ejs>/g, function (_m, body) { return body.replace(/<%/g, '<%%').replace(/%>/g, '%%>'); });
  var src = '';
  var text = '';
  var i = 0;
  function flush() { if (text) { src += '__o+=' + JSON.stringify(text.replace(/%%>/g, '%>')) + ';\n'; text = ''; } }
  while (i < tpl.length) {
    var open = tpl.indexOf('<%', i);
    if (open < 0) { text += tpl.slice(i); break; }
    if (tpl.charAt(open + 2) === '%') { text += tpl.slice(i, open) + '<%'; i = open + 3; continue; }
    text += tpl.slice(i, open);
    var j = open + 2;
    var mod = '';
    var ch = tpl.charAt(j);
    if (ch === '_' || ch === '=' || ch === '-' || ch === '#') { mod = ch; j++; }
    var close = tpl.indexOf('%>', j);
    if (close < 0) throw new SyntaxError('未闭合的 <% 标签');
    var code = tpl.slice(j, close);
    var tail = '';
    var last = code.charAt(code.length - 1);
    if (last === '-' || last === '_') { tail = last; code = code.slice(0, -1); }
    if (mod === '_') text = text.replace(/[ \t]*$/, '');
    flush();
    if (mod === '=') src += '__o+=__fmt((' + code + '));\n';
    else if (mod === '-') src += '__o+=__str((' + code + '));\n';
    else if (mod !== '#') src += code + '\n';
    i = close + 2;
    if (tail === '-') { if (tpl.slice(i, i + 2) === '\r\n') i += 2; else if (tpl.charAt(i) === '\n') i += 1; }
    else if (tail === '_') { var m = /^[ \t]*(\r?\n)?/.exec(tpl.slice(i)); if (m) i += m[0].length; }
  }
  flush();
  return src;
}

function __env(data, meta) {
  var env = {};
  var base = __D.env || {};
  for (var k in base) env[k] = base[k];
  for (var d in __defs) env[d] = __defs[d];
  env.variables = __cache();
  if (data) for (var x in data) env[x] = data[x];
  return env;
}

async function __render(tpl, data, meta) {
  if (typeof tpl !== 'string' || tpl.indexOf('<%') < 0) return tpl;
  if (__depth > 8) return tpl;
  __depth++;
  try {
    var body = __compile(tpl);
    var fn = new Function('__env', '__str', '__fmt', 'with (__env) { return (async function () { var __o = ""; var print = function () { for (var a = 0; a < arguments.length; a++) __o += __str(arguments[a]); }; \n' + body + '\n return __o; })(); }');
    return await fn(__env(data, meta), __str, __D.escape ? __escHtml : __str);
  } finally {
    __depth--;
  }
}

var __list = [];
var __outs = [];
function __load(list) { __list = list; __outs = list.map(function () { return null; }); }
// 宿主逐条调用，每条单独计时；一条死循环不连累其它条
async function __renderOne(i) {
  var item = __list[i];
  __depth = 0;
  try {
    __outs[i] = await __render(item.text, item.data || {}, { name: item.name });
  } catch (e) {
    __errors.push({ index: i, name: item.name || '', message: String((e && e.message) || e) });
    __outs[i] = null;
  }
}
function __result() { return JSON.stringify({ out: __outs, sets: __sets, errors: __errors }); }

function __init(data) {
  __D = data;
  __D.vars = __D.vars || {};
  __D.vars.global = __D.vars.global || {};
  __D.vars.local = __D.vars.local || {};
  __D.vars.message = __D.vars.message || {};
  var env = __D.env || {};
  for (var k in env) globalThis[k] = env[k];
}
`;

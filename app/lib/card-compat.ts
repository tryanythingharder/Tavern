import { currentLocale, tr } from '@/lib/i18n/runtime';
import { helperScriptsFromRaw } from '@/lib/helper-scripts';

// 导入兼容体检：看一张 SillyTavern 卡里用到了哪些东西，平台能用多少。
//   ok       照常生效
//   partial  能用，但有些设置会被忽略（列出是哪些）
//   no       平台不支持，这部分不会生效
// 只做静态检查（不执行卡里的脚本）。文案在这里按当前语言翻译好再返回。
export type CompatLevel = 'ok' | 'partial' | 'no';
export type CompatItem = { key: string; level: CompatLevel; label: string; detail?: string };
export type CompatReport = { items: CompatItem[]; ok: number; partial: number; no: number };

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : isObj(value) ? Object.values(value) : []);

// 世界书条目里平台暂时不认的 ST 设置（值为「默认/关闭」时不算用到）
const LORE_IGNORED: { label: string; used: (entry: Obj, ext: Obj) => boolean }[] = [
  { label: '黏性/冷却/延迟', used: (e, x) => [e.sticky, x.sticky, e.cooldown, x.cooldown, e.delay, x.delay].some((v) => Number(v) > 0) },
  { label: '包含组', used: (e, x) => [e.group, x.group].some((v) => typeof v === 'string' && v.trim() !== '') },
  { label: '向量匹配', used: (e, x) => e.vectorized === true || x.vectorized === true },
  { label: '角色过滤', used: (e, x) => [e.characterFilter, x.character_filter].some((v) => isObj(v) && (list(v.names).length > 0 || list(v.tags).length > 0)) },
  { label: '生成类型触发', used: (e, x) => list(e.triggers ?? x.triggers).length > 0 },
  { label: '延迟到递归', used: (e, x) => Boolean(e.delayUntilRecursion ?? x.delay_until_recursion) },
  { label: '无视预算', used: (e, x) => e.ignoreBudget === true || x.ignore_budget === true },
  {
    label: '匹配人设/描述等额外来源',
    used: (e, x) => ['match_persona_description', 'match_character_description', 'match_character_personality', 'match_character_depth_prompt', 'match_scenario', 'match_creator_notes']
      .some((k) => x[k] === true || e[k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())] === true),
  },
];

// 酒馆助手里平台没实现的接口（runner-api.js 里是 unsupported 桩）
const HELPER_UNSUPPORTED = ['generate', 'generateRaw', 'createChatMessages', 'deleteChatMessages', 'rotateChatMessages', 'replaceWorldbook', 'updateWorldbookWith',
  'createWorldbookEntries', 'deleteWorldbookEntries', 'replaceCharacter', 'updateCharacterWith', 'replacePreset', 'updatePresetWith', 'replaceTavernRegexes',
  'updateTavernRegexesWith', 'importRawCharacter', 'importRawChat'];
const SLASH_SUPPORTED = new Set(['send', 'trigger', 'setinput', 'echo']);
// EJS 里平台只做了空实现的函数（lib/ejs-runtime.ts）
const EJS_STUBS = ['activewi', 'activateWorldInfo', 'activateWorldInfoByKeywords', 'getpreset', 'getPresetPrompt', 'getqr', 'getQuickReply', 'execute', 'injectPrompt', 'activateRegex'];

const sep = () => (currentLocale() === 'en' ? ', ' : '、');
const semi = () => (currentLocale() === 'en' ? '; ' : '；');

export function cardCompat(input: unknown): CompatReport {
  const root = isObj(input) ? input : {};
  const data = isObj(root.data) ? root.data : root;
  const ext = isObj(data.extensions) ? data.extensions : {};
  const items: CompatItem[] = [];
  const add = (key: string, level: CompatLevel, label: string, detail?: string) => items.push({ key, level, label, detail });

  // 开场白
  const alternates = list(data.alternate_greetings).filter((v) => typeof v === 'string' && v.trim()).length;
  add('greetings', 'ok', alternates ? tr('开场白 + {n} 个备选开场白', { n: alternates }) : tr('开场白'));
  const groupOnly = list(data.group_only_greetings).filter((v) => typeof v === 'string' && v.trim()).length;
  if (groupOnly) add('groupGreetings', 'no', tr('群聊专用开场白 {n} 个', { n: groupOnly }), tr('群聊房间暂时不发开场白，这部分不会用到。'));

  // 世界书
  const book = isObj(data.character_book) ? data.character_book : null;
  const entries = book ? list(book.entries).filter(isObj) : [];
  if (entries.length) {
    const ignored: string[] = [];
    for (const rule of LORE_IGNORED) {
      const n = entries.filter((entry) => rule.used(entry, isObj(entry.extensions) ? entry.extensions : {})).length;
      if (n) ignored.push(currentLocale() === 'en' ? `${tr(rule.label)} (${n})` : `${rule.label}（${n}）`);
    }
    add('lore', ignored.length ? 'partial' : 'ok', tr('卡内世界书 {n} 条', { n: entries.length }),
      ignored.length ? tr('这些设置会被忽略，条目按普通方式触发：{list}', { list: ignored.join(sep()) }) : undefined);
  }
  const linked = typeof ext.world === 'string' ? ext.world.trim() : '';
  if (linked && !entries.length) add('linkedBook', 'no', tr('关联的外部世界书「{name}」', { name: linked }), tr('卡里只记了名字，没有带内容。请把这本世界书单独导入到「世界书」里。'));

  // 正则
  const regex = list(ext.regex_scripts).filter(isObj);
  if (regex.length) {
    const offChat = regex.filter((r) => {
      const placement = Array.isArray(r.placement) ? r.placement.map(Number) : [];
      return placement.length > 0 && !placement.includes(1) && !placement.includes(2);
    }).length;
    const macroFind = regex.filter((r) => Number(r.substituteRegex) > 0 || r.substituteRegex === true).length;
    const notes: string[] = [];
    if (offChat) notes.push(tr('{n} 条只作用于世界书/推理/斜杠命令，已停用', { n: offChat }));
    if (macroFind) notes.push(tr('{n} 条在查找里用了宏，按原文匹配', { n: macroFind }));
    add('regex', notes.length ? 'partial' : 'ok', tr('正则脚本 {n} 条', { n: regex.length }), notes.length ? notes.join(semi()) : undefined);
  }

  if (isObj(ext.depth_prompt) && typeof ext.depth_prompt.prompt === 'string' && ext.depth_prompt.prompt.trim()) add('depth', 'ok', tr('角色深度提示'));
  if (typeof data.system_prompt === 'string' && data.system_prompt.trim()) add('system', 'ok', tr('卡内系统提示词'));
  if (typeof data.post_history_instructions === 'string' && data.post_history_instructions.trim()) add('jailbreak', 'ok', tr('历史后指令'));

  const blob = JSON.stringify(data).slice(0, 2_000_000);
  if (/stat_data|\[InitVar\]|initvar|MagVarUpdate|_\.set\(/i.test(blob)) add('mvu', 'ok', tr('MVU 变量'));

  // 酒馆助手脚本
  // MVU 框架脚本平台自己实现了（lib/mvu.ts），不算在内
  const scripts = helperScriptsFromRaw(data).scripts.filter((script) => !script.skipped);
  if (scripts.length) {
    const code = scripts.map((script) => script.content).join('\n');
    const apis = HELPER_UNSUPPORTED.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(code));
    const network = /\bfetch\s*\(|XMLHttpRequest|WebSocket|\$\.(ajax|get|post)\s*\(/.test(code);
    const slashes = [...code.matchAll(/triggerSlash(?:WithResult)?\s*\(\s*[`'"]\/(\w+)/g)].map((m) => m[1].toLowerCase()).filter((cmd) => !SLASH_SUPPORTED.has(cmd));
    const notes: string[] = [];
    if (apis.length) notes.push(tr('用到的这些接口不可用：{list}', { list: apis.join(', ') }));
    if (network) notes.push(tr('脚本要联网，沙盒里会被拦下'));
    if (slashes.length) notes.push(tr('斜杠命令只支持 /send /trigger /setinput /echo，忽略：{list}', { list: [...new Set(slashes)].map((c) => `/${c}`).join(' ') }));
    add('helper', notes.length ? 'partial' : 'ok', tr('酒馆助手脚本 {n} 个', { n: scripts.length }), notes.length ? notes.join(semi()) : undefined);
  }

  // EJS 模板（ST-Prompt-Template）
  if (/<%[\s\S]*?%>/.test(blob)) {
    const stubs = EJS_STUBS.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(blob));
    add('ejs', stubs.length ? 'partial' : 'ok', tr('EJS 模板'), stubs.length ? tr('这些函数只有空实现，不会生效：{list}', { list: stubs.join(', ') }) : undefined);
  }

  if (/<(div|span|style|script|table|details|img|section|html|body|svg|button|link)\b/i.test(blob)) add('html', 'ok', tr('HTML 美化 / 状态栏'));

  // V3 资源：除卡面以外的表情、背景等
  const assets = list(data.assets).filter((a) => isObj(a) && a.type !== 'icon' && !(a.type === 'user_icon'));
  if (assets.length) add('assets', 'no', tr('卡内资源 {n} 个（表情、背景等）', { n: assets.length }), tr('平台暂不使用卡内表情包和背景。'));

  return {
    items,
    ok: items.filter((i) => i.level === 'ok').length,
    partial: items.filter((i) => i.level === 'partial').length,
    no: items.filter((i) => i.level === 'no').length,
  };
}


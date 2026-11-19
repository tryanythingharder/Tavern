// 酒馆助手 API 兼容层（在 runner.html 的沙盒里跑，给角色卡脚本用）。
// 覆盖常用子集：变量读写、事件、脚本按钮、楼层读取/修改、triggerSlash 的 /send /trigger /setinput /echo、toastr、Mvu。
// 不支持的（generate、改世界书/角色卡/预设、创建删除楼层）会抛出明确的错误，作者能看到原因。
(function () {
  'use strict';
  var BOOT = window.__TAVERN_BOOT || {};
  var SCRIPT = BOOT.script || { id: 'script', name: 'script', info: '', buttons: [] };
  var SID = SCRIPT.id;
  var NAMES = BOOT.names || {};
  var S = BOOT.snapshot || { vars: {}, floors: [], total: 0 };
  var _ = window._;

  function cp(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x == null ? {} : x)); }
  function post(msg) { parent.postMessage(msg, '*'); }
  function log(level, text) { post({ type: 'tavern-log', level: level, text: String(text).slice(0, 2000), script: SCRIPT.name }); }
  function unsupported(name) { return function () { var e = new Error(name + '：本站暂不支持'); log('warn', e.message); return Promise.reject(e); }; }

  function ensureVars() {
    S.vars = S.vars || {};
    ['chat', 'character', 'global'].forEach(function (k) { if (!S.vars[k] || typeof S.vars[k] !== 'object') S.vars[k] = {}; });
    S.vars.script = S.vars.script || {};
    if (!S.vars.script[SID]) S.vars.script[SID] = {};
    S.vars.message = S.vars.message || { stat_data: {}, display_data: {}, delta_data: {} };
    S.vars.other = S.vars.other || {};
  }
  ensureVars();

  // ---------- 变量 ----------
  function lastId() { return Math.max(0, (S.total || 0) - 1); }
  function scopeOf(option) {
    var t = (option && option.type) || 'chat';
    if (t === 'script') return { scope: 'script', id: (option && option.script_id) || SID };
    if (t === 'message') return { scope: 'message' };
    if (t === 'chat' || t === 'character' || t === 'global') return { scope: t };
    return { scope: 'other', id: t + ':' + ((option && option.extension_id) || '') };
  }
  function read(option) {
    var s = scopeOf(option);
    if (s.scope === 'script') return S.vars.script[s.id] || {};
    if (s.scope === 'message') {
      var mid = option && option.message_id;
      if (mid === undefined || mid === 'latest' || mid === -1 || mid === lastId()) return S.vars.message;
      return {}; // 只给最新一楼的楼层变量（按楼层重放见 lib/mvu.ts）
    }
    if (s.scope === 'other') return S.vars.other[s.id] || {};
    return S.vars[s.scope];
  }
  function write(option, value) {
    var s = scopeOf(option);
    var v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    if (s.scope === 'script') S.vars.script[s.id] = v;
    else if (s.scope === 'message') S.vars.message = v; // 楼层变量只改本次会话
    else if (s.scope === 'other') S.vars.other[s.id] = v;
    else S.vars[s.scope] = v;
    if (s.scope === 'chat' || s.scope === 'character' || s.scope === 'global' || s.scope === 'script') {
      post({ type: 'tavern-vars', scope: s.scope, scriptId: s.id, data: cp(v) });
    }
    if (s.scope === 'message') emitLocal('mag_variable_updated', [cp(v)]);
  }
  window.getVariables = function (option) { return cp(read(option)); };
  window.getAllVariables = function () {
    return _.merge({}, cp(S.vars.global), cp(S.vars.character), cp(S.vars.script[SID]), cp(S.vars.chat), cp(S.vars.message));
  };
  window.replaceVariables = function (variables, option) { write(option, cp(variables)); };
  window.updateVariablesWith = function (updater, option) {
    var v = cp(read(option));
    var r = updater(v);
    if (r && typeof r.then === 'function') return r.then(function (x) { write(option, x || v); return x || v; });
    write(option, r || v);
    return r || v;
  };
  window.insertOrAssignVariables = function (variables, option) { var v = cp(read(option)); _.merge(v, cp(variables)); write(option, v); return v; };
  window.insertVariables = function (variables, option) { var v = cp(read(option)); _.defaultsDeep(v, cp(variables)); write(option, v); return v; };
  window.deleteVariable = function (path, option) {
    var v = cp(read(option)); var had = _.has(v, path); _.unset(v, path); write(option, v);
    return { variables: v, delete_occurred: had };
  };
  window.registerVariableSchema = function () {};
  window.flushHelperVariables = function () { return Promise.resolve(); };

  // ---------- 事件 ----------
  var listeners = {};
  function list(t) { return listeners[t] || (listeners[t] = []); }
  function off(t, fn) { var l = list(t); var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function handle(t, fn) { return { stop: function () { off(t, fn); } }; }
  function emitLocal(t, args) {
    var l = list(t).slice();
    var chain = Promise.resolve();
    l.forEach(function (fn) {
      chain = chain.then(function () { try { return fn.apply(null, args || []); } catch (e) { log('error', e && e.stack || e); } })
        .catch(function (e) { log('error', e && e.stack || e); });
    });
    return chain;
  }
  window.eventOn = function (t, fn) { if (list(t).indexOf(fn) < 0) list(t).push(fn); return handle(t, fn); };
  window.eventMakeLast = function (t, fn) { off(t, fn); list(t).push(fn); return handle(t, fn); };
  window.eventMakeFirst = function (t, fn) { off(t, fn); list(t).unshift(fn); return handle(t, fn); };
  window.eventOnce = function (t, fn) { var w = function () { off(t, w); return fn.apply(null, arguments); }; list(t).push(w); return handle(t, w); };
  window.eventEmit = function (t) { var args = [].slice.call(arguments, 1); post({ type: 'tavern-emit', event: t, args: safeArgs(args) }); return emitLocal(t, args); };
  window.eventEmitAndWait = window.eventEmit;
  window.eventRemoveListener = off;
  window.eventClearEvent = function (t) { listeners[t] = []; };
  window.eventClearListener = function (fn) { Object.keys(listeners).forEach(function (t) { off(t, fn); }); };
  window.eventClearAll = function () { listeners = {}; };
  window.eventOff = off;
  function safeArgs(args) { try { return JSON.parse(JSON.stringify(args)); } catch (e) { return []; } }

  window.iframe_events = {
    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started', MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',
    GENERATION_REQUESTED: 'js_generation_requested', GENERATION_STARTED: 'js_generation_started',
    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully', STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',
    GENERATION_ENDED: 'js_generation_ended',
  };
  window.tavern_events = {
    APP_READY: 'app_ready', MESSAGE_SWIPED: 'message_swiped', MESSAGE_SENT: 'message_sent', MESSAGE_RECEIVED: 'message_received',
    MESSAGE_EDITED: 'message_edited', MESSAGE_DELETED: 'message_deleted', MESSAGE_UPDATED: 'message_updated', MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
    MORE_MESSAGES_LOADED: 'more_messages_loaded', IMPERSONATE_READY: 'impersonate_ready', CHAT_CHANGED: 'chat_id_changed',
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS', GENERATION_STARTED: 'generation_started', GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended', USER_MESSAGE_RENDERED: 'user_message_rendered', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    CHAT_CREATED: 'chat_created', CHAT_DELETED: 'chat_deleted', SETTINGS_UPDATED: 'settings_updated', WORLDINFO_UPDATED: 'worldinfo_updated',
    CHARACTER_EDITED: 'character_edited', GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
    GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts', GENERATE_AFTER_DATA: 'generate_after_data',
    WORLD_INFO_ACTIVATED: 'world_info_activated', CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
    STREAM_TOKEN_RECEIVED: 'stream_token_received', MESSAGE_FILE_EMBEDDED: 'message_file_embedded',
  };

  // ---------- 脚本与按钮 ----------
  var buttons = (SCRIPT.buttons || []).map(function (b) { return { name: b.name, visible: b.visible !== false }; });
  function pushButtons() { post({ type: 'tavern-buttons', buttons: cp(buttons) }); }
  window.getScriptId = function () { return SID; };
  window.getScriptName = function () { return SCRIPT.name; };
  window.getScriptInfo = function () { return SCRIPT.info || ''; };
  window.replaceScriptInfo = function (info) { SCRIPT.info = String(info || ''); };
  window.getButtonEvent = function (name) { return 'button:' + SID + ':' + name; };
  window.getScriptButtons = function () { return cp(buttons); };
  window.replaceScriptButtons = function (a, b) { buttons = cp(Array.isArray(a) ? a : b) || []; pushButtons(); };
  window.updateScriptButtonsWith = function (fn) { var r = fn(cp(buttons)); var done = function (x) { buttons = cp(x || buttons); pushButtons(); return buttons; }; return r && r.then ? r.then(done) : done(r); };
  window.appendInexistentScriptButtons = function (a, b) {
    var add = Array.isArray(a) ? a : b || [];
    add.forEach(function (x) { if (!buttons.some(function (y) { return y.name === x.name; })) buttons.push({ name: x.name, visible: x.visible !== false }); });
    pushButtons();
  };
  window.getAllEnabledScriptButtons = function () { var o = {}; o[SID] = buttons.filter(function (b) { return b.visible; }).map(function (b) { return { button_id: b.name, button_name: b.name }; }); return o; };
  window.eventOnButton = function (name, fn) { return window.eventOn(window.getButtonEvent(name), fn); };

  // ---------- 楼层 ----------
  function floorObj(f) {
    var isLast = f.message_id === lastId();
    var data = isLast ? cp(S.vars.message) : {};
    return { message_id: f.message_id, name: f.role === 'user' ? (NAMES.user || '') : (NAMES.char || ''), role: f.role, is_hidden: false,
      message: f.message, data: data, extra: {}, swipe_id: 0, swipes: [f.message], swipes_data: [data], swipes_info: [{}] };
  }
  function parseRange(range) {
    var last = lastId();
    if (range === undefined || range === null) return [0, last];
    if (typeof range === 'number') { var n = range < 0 ? last + 1 + range : range; return [n, n]; }
    var s = String(range).replace(/\{\{lastMessageId\}\}/g, String(last)).trim();
    var m = s.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    function fix(x) { x = Number(x); return x < 0 ? last + 1 + x : x; }
    if (m) return [fix(m[1]), fix(m[2])];
    if (/^-?\d+$/.test(s)) { var k = fix(s); return [k, k]; }
    return [0, last];
  }
  window.getChatMessages = function (range, option) {
    var r = parseRange(range); var role = (option && option.role) || 'all';
    return (S.floors || []).filter(function (f) { return f.message_id >= Math.min(r[0], r[1]) && f.message_id <= Math.max(r[0], r[1]) && (role === 'all' || f.role === role); }).map(floorObj);
  };
  window.getLastMessageId = lastId;
  window.getCurrentMessageId = lastId;
  window.getMessageId = lastId;

  var rpcSeq = 0; var pending = {};
  function rpc(method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++rpcSeq; pending[id] = { resolve: resolve, reject: reject };
      post({ type: 'tavern-rpc', id: id, method: method, args: safeArgs(args) });
    });
  }
  window.setChatMessages = function (messages, option) { return rpc('setChatMessages', [messages, option || {}]); };
  window.setChatMessage = function (field, id) { var m = typeof field === 'string' ? field : field && field.message; return rpc('setChatMessages', [[{ message_id: id === undefined ? lastId() : id, message: m }], {}]); };
  window.triggerSlash = function (command) { return rpc('slash', [String(command || '')]); };
  window.triggerSlashWithResult = window.triggerSlash;
  window.createChatMessages = unsupported('createChatMessages');
  window.deleteChatMessages = unsupported('deleteChatMessages');
  window.rotateChatMessages = unsupported('rotateChatMessages');
  window.generate = unsupported('generate');
  window.generateRaw = unsupported('generateRaw');
  window.stopAllGeneration = function () { return false; };
  ['replaceWorldbook', 'updateWorldbookWith', 'createWorldbookEntries', 'deleteWorldbookEntries', 'replaceCharacter', 'updateCharacterWith',
   'replacePreset', 'updatePresetWith', 'replaceTavernRegexes', 'updateTavernRegexesWith', 'importRawCharacter', 'importRawChat'].forEach(function (n) { window[n] = unsupported(n); });
  window.getWorldbookNames = function () { return []; };
  window.getCharWorldbookNames = function () { return { primary: null, additional: [] }; };
  window.getWorldbook = function () { return Promise.resolve([]); };
  window.getTavernRegexes = function () { return []; };
  window.isCharacterTavernRegexesEnabled = function () { return true; };
  window.formatAsDisplayedMessage = function (s) { return String(s); };
  window.retrieveDisplayedMessage = function () { return window.$ ? window.$() : null; };
  window.refreshOneMessage = function () { return Promise.resolve(); };

  // ---------- 其它 ----------
  window.substitudeMacros = function (s) { return String(s).replace(/\{\{char\}\}/gi, NAMES.char || '').replace(/\{\{user\}\}/gi, NAMES.user || '').replace(/\{\{lastMessageId\}\}/gi, String(lastId())); };
  window.getCurrentCharacterName = function () { return NAMES.char || null; };
  window.getCharacterNames = function () { return NAMES.char ? [NAMES.char] : []; };
  window.getCharData = function () { return { name: NAMES.char || '' }; };
  window.getTavernHelperVersion = function () { return '4.0.0'; };
  window.getHelperVersion = window.getTavernHelperVersion;
  window.getTavernVersion = function () { return '1.13.0'; };
  window.getIframeName = function () { return 'TH-script--' + SCRIPT.name + '--' + SID; };
  window.reloadIframe = function () {};
  window.errorCatched = function (fn) {
    return function () {
      try { var r = fn.apply(this, arguments); return r && r.catch ? r.catch(function (e) { log('error', e && e.stack || e); }) : r; }
      catch (e) { log('error', e && e.stack || e); }
    };
  };
  window.initializeGlobal = function (name, value) { window[name] = value; };
  window.waitGlobalInitialized = function (name) {
    return new Promise(function (resolve) {
      var n = 0; (function wait() { if (!name || window[name] !== undefined) return resolve(window[name]); if (++n > 100) return resolve(undefined); setTimeout(wait, 100); })();
    });
  };
  function toast(level) { return function (text, title) { post({ type: 'tavern-toast', level: level, text: String(title ? title + '：' + text : text).slice(0, 300) }); }; }
  window.toastr = { info: toast('info'), success: toast('success'), warning: toast('warning'), error: toast('error'), clear: function () {}, remove: function () {} };

  // 平台自带 MVU 引擎：Mvu 接口读写最新一楼的变量（写入只在本次会话里有效）
  window.Mvu = {
    events: { VARIABLE_INITIALIZED: 'mag_variable_initialized', VARIABLE_UPDATE_STARTED: 'mag_variable_update_started', VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended', SINGLE_VARIABLE_UPDATED: 'mag_variable_updated', COMMAND_PARSED: 'mag_command_parsed' },
    getMvuData: function () { return cp(S.vars.message); },
    replaceMvuData: function (d) { write({ type: 'message' }, cp(d)); return Promise.resolve(); },
    getMvuVariable: function (d, p, o) { var v = _.get(d && d.stat_data ? d.stat_data : d, p); if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string') v = v[0]; return v === undefined && o ? o.default_value : v; },
    setMvuVariable: function (d, p, v) { _.set(d.stat_data || d, p, v); return Promise.resolve(true); },
    parseMessage: function () { return Promise.resolve(undefined); },
  };

  window.SillyTavern = {
    getContext: function () {
      return {
        chat: (S.floors || []).map(function (f) { return { mes: f.message, is_user: f.role === 'user', is_system: f.role === 'system', name: f.role === 'user' ? NAMES.user : NAMES.char }; }),
        name1: NAMES.user || '', name2: NAMES.char || '', characters: [], chatMetadata: { variables: cp(S.vars.chat) },
        eventSource: { on: window.eventOn, once: window.eventOnce, emit: window.eventEmit, removeListener: off },
        event_types: window.tavern_events,
      };
    },
  };
  window.TavernHelper = {};
  ['getVariables', 'getAllVariables', 'replaceVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'insertVariables', 'deleteVariable',
   'eventOn', 'eventOnce', 'eventEmit', 'eventMakeFirst', 'eventMakeLast', 'eventRemoveListener', 'eventClearAll', 'getButtonEvent', 'getScriptButtons',
   'replaceScriptButtons', 'appendInexistentScriptButtons', 'getScriptId', 'getChatMessages', 'setChatMessages', 'getLastMessageId', 'getCurrentMessageId',
   'triggerSlash', 'substitudeMacros', 'getCurrentCharacterName', 'generate', 'generateRaw', 'errorCatched'].forEach(function (n) { window.TavernHelper[n] = window[n]; });

  // ---------- 外层消息 ----------
  addEventListener('message', function (event) {
    var d = event.data;
    if (event.source !== parent || !d) return;
    if (d.type === 'tavern-sync' && d.snapshot) {
      S.floors = d.snapshot.floors || S.floors; S.total = d.snapshot.total != null ? d.snapshot.total : S.total;
      if (d.snapshot.vars) { var mine = S.vars.script[SID]; S.vars = d.snapshot.vars; ensureVars(); if (d.keepScript) S.vars.script[SID] = mine; }
    } else if (d.type === 'tavern-vars-changed') {
      if (d.scope === 'script') S.vars.script[d.scriptId] = d.data; else if (d.scope in S.vars) S.vars[d.scope] = d.data;
    } else if (d.type === 'tavern-event') {
      emitLocal(d.event, d.args || []);
    } else if (d.type === 'tavern-button') {
      emitLocal(window.getButtonEvent(d.name), []);
    } else if (d.type === 'tavern-rpc-result' && pending[d.id]) {
      var p = pending[d.id]; delete pending[d.id];
      if (d.ok) p.resolve(d.value); else p.reject(new Error(d.error || '失败'));
    }
  });
  addEventListener('error', function (e) { log('error', (e.error && e.error.stack) || e.message); });
  addEventListener('unhandledrejection', function (e) { log('error', (e.reason && e.reason.stack) || e.reason); });
  pushButtons();
})();

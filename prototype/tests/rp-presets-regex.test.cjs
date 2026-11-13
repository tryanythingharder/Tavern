'use strict';
// 正则规则（输出清洗）与预设（提示词组装）：引擎、作用域、顺序、预算与持久化。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const directory = path.resolve(__dirname, '..');
const harnessSource = fs.readFileSync(path.join(directory, 'rp-state.test.cjs'), 'utf8').split('\nfunction createFields(')[0];
const shared = { require, __dirname: directory, URL, URLSearchParams, console, atob, TextDecoder };
vm.runInNewContext(`${harnessSource}\nglobalThis.sharedHarness={harness};`, shared);
const { harness, makeStorage } = shared;
const key = 'rp-platform-state';

function chatPage() {
    const h = harness(undefined, '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    h.run('renderChat()');
    return h;
}

const pushRule = (h, rule) => h.run(`regexRules.push(normalizeRegexRule(${JSON.stringify(rule)}))`);

test('纯文本规则按字面替换，不当作正则', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-plain', name: '字面', find: 'a.b', replace: 'X' });
    assert.equal(h.run(`applyRegexRules('axb',{}).text`), 'axb', '点号不应匹配任意字符');
    assert.equal(h.run(`applyRegexRules('a.b a.b',{}).text`), 'X X', '纯文本规则替换全部出现');
});

test('斜杠写法按正则解析，支持捕获组与 flags', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-cap', name: '捕获组', find: '/「([^」]+)」/', replace: '『$1』' });
    const result = h.run(`applyRegexRules('她说「你迟到了」。',{})`);
    assert.equal(result.text, '她说『你迟到了』。');
    assert.equal(result.applied[0].count, 1);
    pushRule(h, { id: 'r-flag', name: '忽略大小写', find: '/ab/i', replace: 'X' });
    assert.equal(h.run(`applyRegexRules('AB ab',{purpose:'send',target:'assistant'}).text`), 'AB ab'.replace(/ab/i, 'X'), '无 g 时只替换第一处');
});

test('非法表达式只记录错误，不改动文本', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-bad', name: '坏规则', find: '/[//', replace: 'X' });
    pushRule(h, { id: 'r-empty', name: '空规则', find: '', replace: 'X' });
    const result = h.run(`applyRegexRules('原样文本',{})`);
    assert.equal(result.text, '原样文本');
    assert.equal(result.applied.length, 0);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0].message, /解析|填写/);
});

test('作用域决定规则只在显示或只在发送时生效', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-display', name: '仅显示', find: '三年', replace: '三年D', scope: 'display' });
    pushRule(h, { id: 'r-send', name: '仅发送', find: '三年', replace: '三年S', scope: 'send' });
    assert.equal(h.run(`applyRegexRules('三年',{purpose:'display'}).text`), '三年D');
    assert.equal(h.run(`applyRegexRules('三年',{purpose:'send'}).text`), '三年S');
    pushRule(h, { id: 'r-both', name: '两者', find: '三年', replace: '三年B', scope: 'both', order: 9 });
    // 后一条规则在前一条改过的文本上继续执行，所以结果是「三年BD」而不是两段并排。
    assert.equal(h.run(`applyRegexRules('三年',{purpose:'display'}).text`), '三年BD');
});

test('对象过滤区分玩家与角色，系统记录只被 all 规则改写', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-user', name: '仅玩家', find: 'x', replace: 'U', target: 'user' });
    pushRule(h, { id: 'r-ai', name: '仅角色', find: 'x', replace: 'A', target: 'assistant' });
    pushRule(h, { id: 'r-all', name: '全部对象', find: 'x', replace: 'S', target: 'all' });
    assert.equal(h.run(`applyRegexRules('x',{target:'user'}).text`), 'U');
    assert.equal(h.run(`applyRegexRules('x',{target:'assistant'}).text`), 'A');
    assert.equal(h.run(`applyRegexRules('x',{target:'system'}).text`), 'S', '系统记录只被 all 规则改写');
    assert.equal(h.run(`applyRegexRules('x',{target:'system',purpose:'send'}).text`), 'S');
});

test('规则按 order 依次执行，顺序影响最终文本', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-1', name: '先加后缀', find: '三年', replace: '三年X', order: 1 });
    pushRule(h, { id: 'r-2', name: '再改名', find: '三年X', replace: '三年Y', order: 2 });
    assert.equal(h.run(`applyRegexRules('三年',{}).text`), '三年Y');
    h.run(`regexRules.find(rule => rule.id === 'r-1').order = 5`);
    assert.equal(h.run(`applyRegexRules('三年',{}).text`), '三年X', '顺序反转后第二步不再命中');
});

test('停用的规则不参与替换', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-off', name: '停用', find: '三年', replace: '三年', enabled: false });
    const result = h.run(`applyRegexRules('三年',{})`);
    assert.equal(result.text, '三年');
    assert.equal(result.applied.length, 0);
});

test('对话页渲染应用显示规则，替换结果按纯文本转义', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-txt', name: '改名', find: '请柬', replace: '信笺', scope: 'display' });
    pushRule(h, { id: 'r-html', name: '注入尝试', find: '烟', replace: '<img src=x onerror=alert(1)>', scope: 'display' });
    h.run('drawMessages()');
    // 测试替身的 innerHTML 只回显最后一次赋值，所以检查渲染后的可读文本与元素数量。
    const text = h.run(`document.querySelector('#messages').textContent`);
    assert.ok(text.includes('信笺'), '显示规则应作用于页面');
    assert.ok(!text.includes('请柬'), '原词应被替换');
    assert.ok(text.includes('<img src=x onerror=alert(1)>'), '替换结果按纯文本显示');
    // 情绪表情是合法图片；注入尝试必须没有变成元素
    assert.equal(h.run(`document.querySelector('#messages').querySelectorAll('img[onerror], img[src="x"]').length`), 0, '替换结果不能变成真实元素');
    assert.ok(h.run(`[...document.querySelectorAll('#messages img')].every(img => img.getAttribute('src').startsWith('assets/expressions/'))`), '只允许情绪表情图片');
});

test('超过长度上限的文本只处理前半段并标记', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-limit', name: '上限', find: 'end', replace: 'END' });
    const result = h.run(`applyRegexRules('${'a'.repeat(20010)}end',{})`);
    assert.equal(result.truncated, true);
    assert.equal(result.applied.length, 0, '尾部超出上限，未处理');
});

test('导入 SillyTavern 正则 JSON 时映射 placement 与 disabled', () => {
    const h = chatPage();
    const rules = h.run(`parseRegexImport(${JSON.stringify(JSON.stringify([
        { name: 'ST 规则', findRegex: '/烟雾/g', replaceString: '烟', disabled: true, placement: [2] },
        { name: '双向', findRegex: '/雨/', replaceString: '雨声', placement: [1, 2] },
    ]))})`);
    assert.equal(rules.length, 2);
    assert.equal(rules[0].target, 'assistant');
    assert.equal(rules[0].enabled, false);
    assert.equal(rules[1].target, 'all');
    assert.equal(h.run(`parseRegexImport('not json')`), null);
});

test('默认预设存在，可用作兜底', () => {
    const h = chatPage();
    assert.equal(h.run('presets.length'), 1);
    assert.equal(h.run('presets[0].id'), 'preset-local-default');
    assert.ok(h.run('activePreset(currentChat).system').length > 0);
    assert.equal(h.run('activePresetId'), 'preset-local-default');
});

test('组装按预设顺序与开关，关闭的块不进入文本', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.context.memory = '他答应把旧稿子留给我。'; })`);
    const full = h.run('assemblePrompt(currentChat)');
    const labels = [...full.blocks.map(block => block.label)];
    assert.deepEqual(labels, ['系统提示', '角色设定', '玩家身份', '世界书命中', '自动摘要', '记忆检索', '记忆摘要', '作者注释', '对话示例', '最近消息', '后置提示']);
    assert.ok(full.text.includes('他答应把旧稿子留给我。'), '记忆摘要应进入文本');
    assert.ok(full.text.indexOf('### 系统提示') < full.text.indexOf('### 最近消息'), '系统提示在历史之前');
    h.run(`presets[0].order = presets[0].order.map(item => item.key === 'memory' ? {...item,enabled:false} : item)`);
    const trimmed = h.run('assemblePrompt(currentChat)');
    assert.ok(!trimmed.text.includes('他答应把旧稿子留给我。'));
    assert.equal(trimmed.blocks.find(block => block.key === 'memory').enabled, false);
});

test('发送作用域的规则改写进入上下文的消息，显示作用域的不改写', () => {
    const h = chatPage();
    // chat-lin-1 的开场白里有「请柬」，它同时出现在页面与历史块里。
    pushRule(h, { id: 'r-send', name: '仅发送', find: '请柬', replace: '信笺', scope: 'send' });
    pushRule(h, { id: 'r-display', name: '仅显示', find: '请柬', replace: '暗格', scope: 'display' });
    const prompt = h.run('assemblePrompt(currentChat)');
    assert.ok(prompt.text.includes('信笺'), '发送规则应改写进入上下文的历史消息');
    assert.ok(!prompt.text.includes('暗格'), '显示规则不应改写上下文');
    h.run('drawMessages()');
    const pageText = h.run(`document.querySelector('#messages').textContent`);
    assert.ok(pageText.includes('暗格'), '显示规则作用于页面');
    assert.ok(!pageText.includes('信笺'), '发送规则不改变页面显示');
});

test('历史超预算时丢弃更早的消息，最新一条始终保留', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => {
        chat.messages = [
            {role:'assistant',text:'${'早'.repeat(5000)}'},
            {role:'user',text:'${'中'.repeat(5000)}'},
            {role:'assistant',text:'最后一句必须留下'},
        ];
    })`);
    h.run(`presets[0].order = presets[0].order.map(item => ({...item,enabled:item.key === 'history'}))`);
    const prompt = h.run('assemblePrompt(currentChat)');
    const block = prompt.blocks.find(item => item.key === 'history');
    // 预算 6000：最新一条 + 倒数第二条能放下，最早那条被丢弃。
    assert.equal(block.dropped, 1, '超预算的最早消息被丢弃');
    assert.ok(prompt.text.includes('最后一句必须留下'));
    assert.ok(prompt.text.includes('中'.repeat(50)), '倒数第二条仍在上下文里');
    assert.ok(!prompt.text.includes('早'.repeat(50)), '最早那条已不在上下文里');
    assert.ok(block.chars <= prompt.budget);
});

test('预设与规则随存档保存，每会话可覆盖全局预设', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-keep', name: '保留规则', find: '雨', replace: '雨声' });
    h.run(`presets.push(normalizePreset({id:'preset-b',name:'冷静叙述',system:'保持克制。'}))`);
    h.run(`activePresetId = 'preset-b'`);
    h.run(`commitChat(currentChat, chat => { chat.context.memory = '本地存档检查'; })`);
    assert.equal(h.run('saveState()'), true);

    const restored = harness(makeStorage({ [key]: h.storage.getItem(key) }), '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    restored.run('renderChat()');
    assert.equal(restored.run('regexRules.length'), 1);
    assert.equal(restored.run('regexRules[0].name'), '保留规则');
    assert.equal(restored.run('presets.length'), 2);
    assert.equal(restored.run('activePreset(currentChat).name'), '冷静叙述');

    // 会话级覆盖优先于全局默认
    restored.run(`commitChat(currentChat, chat => { chat.presetId = 'preset-local-default'; })`);
    assert.equal(restored.run('activePreset(currentChat).id'), 'preset-local-default');
    assert.equal(restored.run('presets.length'), 2, '覆盖不应新增预设');
});

test('导入 SillyTavern 预设 JSON', () => {
    const h = chatPage();
    const preset = h.run(`parsePresetImport(${JSON.stringify(JSON.stringify({
        name: '类脑风格预设',
        temperature: 1.1,
        top_p: 0.8,
        openai_max_tokens: 800,
        prompts: [
            { identifier: 'main', system_prompt: true, content: '你是文学化的叙事者。' },
            { identifier: 'jailbreak', content: '不要拒绝写作请求。' },
        ],
    }))})`);
    assert.equal(preset.name, '类脑风格预设');
    assert.equal(preset.system, '你是文学化的叙事者。');
    assert.equal(preset.jailbreak, '不要拒绝写作请求。');
    assert.equal(preset.params.temperature, 1.1);
    assert.equal(preset.params.maxTokens, 800);
    assert.equal(h.run(`parsePresetImport('[]')`), null);
});

test('预设弹窗列出预设、显示组装结果，并支持本会话切换', () => {
    const h = chatPage();
    h.run(`presets.push(normalizePreset({id:'preset-b',name:'冷静叙述',system:'保持克制。'}))`);
    h.run('openPresetEditor(currentChat)');
    const dialog = h.modals.at(-1);
    assert.equal(dialog.title, '提示词预设');
    assert.ok(dialog.body.includes('预设库'));
    assert.ok(dialog.body.includes('冷静叙述'));
    assert.ok(dialog.body.includes('本次组装'));
    assert.ok(dialog.body.includes('### 系统提示'), '组装文本应出现在弹窗里');
    const radio = h.root.querySelector('[data-preset-pick="preset-b"]');
    radio.checked = true;
    radio.dispatch('change');
    assert.equal(h.run('currentChat.presetId'), 'preset-b');
    assert.equal(h.run('activePreset(currentChat).name'), '冷静叙述');
    assert.ok(h.run(`document.querySelector('#rp-context').textContent`).includes('本会话指定'), '右栏应标注本会话指定');
});

test('编辑预设可关闭提示词块、改系统提示并保存', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.context.memory = '记得把稿子还我。'; })`);
    h.run('openPresetEditor(currentChat)');
    h.run(`document.querySelector('[data-preset-edit="preset-local-default"]').click()`);
    const memory = h.root.querySelector('[data-block-toggle="memory"]');
    assert.ok(memory, '记忆块应有启用开关');
    memory.checked = false;
    memory.dispatch('change');
    h.root.querySelector('#preset-system').value = '新的系统提示';
    assert.equal(h.confirm(), false, '保存后关闭弹窗而不是继续冒泡');
    assert.equal(h.run(`presets[0].order.find(item => item.key === 'memory').enabled`), false);
    assert.equal(h.run('presets[0].system'), '新的系统提示');
    assert.ok(!h.run('assemblePrompt(currentChat).text').includes('记得把稿子还我。'));
});

test('提示词块可上下移动并改变组装顺序', () => {
    const h = chatPage();
    h.run('openPresetEditor(currentChat)');
    h.run(`document.querySelector('[data-preset-edit="preset-local-default"]').click()`);
    h.run(`document.querySelector('[data-block-down="system"]').click()`);
    h.root.querySelector('#preset-name').value = '重排后的预设';
    h.confirm();
    assert.deepEqual([...h.run(`presets[0].order.slice(0,2).map(item => item.key)`)], ['character','system']);
    const text = h.run('assemblePrompt(currentChat).text');
    assert.ok(text.indexOf('### 角色设定') < text.indexOf('### 系统提示'), '组装文本按新顺序');
});

test('正则弹窗可新建规则、试跑并持久化', () => {
    const h = chatPage();
    h.run('openRegexEditor()');
    const dialog = h.modals.at(-1);
    assert.ok(dialog.body.includes('规则库'));
    assert.ok(dialog.body.includes('试跑'));
    h.run(`document.querySelector('#rule-new').click()`);
    h.root.querySelector('#rule-name').value = '引号统一';
    h.root.querySelector('#rule-find').value = '/「([^」]+)」/g';
    h.root.querySelector('#rule-replace').value = '『$1』';
    h.confirm();
    assert.equal(h.run('regexRules.length'), 1);
    assert.equal(h.run('regexRules[0].name'), '引号统一');
    assert.equal(h.run(`applyRegexRules('她说「好」。',{}).text`), '她说『好』。');
    const raw = h.storage.getItem(key);
    const restored = harness(makeStorage({ [key]: raw }), '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    assert.equal(restored.run('regexRules.length'), 1);
    assert.equal(restored.run('regexRules[0].replace'), '『$1』');
});

test('规则开关与非法表达式在弹窗里被拦下', () => {
    const h = chatPage();
    pushRule(h, { id: 'r-ui', name: '可开关', find: '雨', replace: '雨声' });
    h.run('openRegexEditor()');
    const toggle = h.root.querySelector('[data-rule-toggle="r-ui"]');
    toggle.checked = false;
    toggle.dispatch('change');
    assert.equal(h.run(`regexRules.find(rule => rule.id === 'r-ui').enabled`), false);
    h.run(`document.querySelector('[data-rule-edit="r-ui"]').click()`);
    h.root.querySelector('#rule-find').value = '/[/';
    assert.equal(h.confirm(), false, '非法表达式不关闭弹窗');
    assert.equal(h.run(`regexRules.find(rule => rule.id === 'r-ui').find`), '雨', '非法输入没有写回');
    assert.ok(h.toasts.at(-1)[0].includes('解析'), '应提示表达式无法解析');
});

test('规则编辑器试跑未保存的草稿，保存后页面立刻重绘', () => {
    const h = chatPage();
    h.run('openRegexEditor()');
    h.run(`document.querySelector('#rule-new').click()`);
    h.root.querySelector('#rule-name').value = '草稿试跑';
    h.root.querySelector('#rule-find').value = '请柬';
    h.root.querySelector('#rule-replace').value = '信笺';
    h.run(`document.querySelector('#rule-replace').dispatch('input')`);
    const preview = h.root.querySelector('#rule-preview').textContent;
    assert.ok(preview.includes('信笺'), '未保存的草稿也要出现在试跑结果里');
    assert.ok(preview.includes('命中 1 处'));
    h.confirm();
    assert.equal(h.run('regexRules.length'), 1);
    const pageText = h.run(`document.querySelector('#messages').textContent`);
    assert.ok(pageText.includes('信笺'), '保存后立即重绘页面消息');
    assert.ok(!pageText.includes('请柬'));
});

test('采样参数完整度：默认值、越界钳制与 ST 预设导入映射', () => {
    const h = chatPage();
    // 默认预设的完整采样参数
    const defaults = h.run('JSON.parse(JSON.stringify(presets[0].params))');
    assert.equal(defaults.topK, 0);
    assert.equal(defaults.minP, 0);
    assert.equal(defaults.typicalP, 1);
    assert.equal(defaults.repetitionPenalty, 1.1);
    assert.equal(defaults.repetitionPenaltyRange, 1024);
    assert.equal(defaults.presencePenalty, 0);
    assert.equal(defaults.frequencyPenalty, 0);
    assert.equal(defaults.seed, -1);
    // 越界值被钳制
    const clamped = h.run(`JSON.parse(JSON.stringify(normalizePreset({name:'越界',params:{temperature:9,topP:0,topK:999,minP:-1,typicalP:5,repetitionPenalty:5,presencePenalty:-9,frequencyPenalty:9,maxTokens:1,seed:-5}}).params))`);
    assert.equal(clamped.temperature, 2);
    assert.equal(clamped.topP, 0.05);
    assert.equal(clamped.topK, 200);
    assert.equal(clamped.minP, 0);
    assert.equal(clamped.typicalP, 1);
    assert.equal(clamped.repetitionPenalty, 2);
    assert.equal(clamped.presencePenalty, -2);
    assert.equal(clamped.frequencyPenalty, 2);
    assert.equal(clamped.maxTokens, 16);
    assert.equal(clamped.seed, -1);
    // ST 预设导入：完整采样参数映射（含 rep_pen / presence_pen 别名）
    const imported = h.run(`(() => { const preset = parsePresetImport(JSON.stringify({name:'ST 采样预设',temperature:0.7,top_p:0.9,top_k:40,min_p:0.05,typical_p:0.98,rep_pen:1.15,rep_pen_range:512,rep_pen_slope:0.6,presence_pen:0.3,freq_pen:0.2,openai_max_tokens:300,seed:42,prompts:[]})); return JSON.stringify(preset.params); })()`);
    const params = JSON.parse(imported);
    assert.equal(params.temperature, 0.7);
    assert.equal(params.topP, 0.9);
    assert.equal(params.topK, 40);
    assert.equal(params.minP, 0.05);
    assert.equal(params.typicalP, 0.98);
    assert.equal(params.repetitionPenalty, 1.15);
    assert.equal(params.repetitionPenaltyRange, 512);
    assert.equal(params.repetitionPenaltySlope, 0.6);
    assert.equal(params.presencePenalty, 0.3);
    assert.equal(params.frequencyPenalty, 0.2);
    assert.equal(params.maxTokens, 300);
    assert.equal(params.seed, 42);
});

test('上下文模板与 Instruct 序列：占位符替换、空行省略、序列包装与 ST 导入', () => {
    const h = chatPage();
    // 模板渲染：占位符替换；占位符为空的行整行省略
    const rendered = h.run(`renderContextTemplate('【角色名】{{char}}\\n【一句话简介】{{hook}}\\n【场景】{{scenario}}', {char:'沈砚之',hook:'',scenario:'雨夜报馆'})`);
    assert.equal(rendered, '【角色名】沈砚之\n【场景】雨夜报馆');
    // 角色块按预设模板组装
    h.run(`presets[0].contextTemplate = 'NAME:{{char}}\\nSCENE:{{scenario}}'`);
    const characterBlock = h.run(`promptBlockText(currentChat,'character',scanLore(currentChat))`);
    assert.match(characterBlock, /^NAME:/);
    assert.match(characterBlock, /SCENE:/);
    assert.ok(!characterBlock.includes('【角色名】'), '自定义模板替换默认标签');
    h.run(`presets[0].contextTemplate = DEFAULT_CONTEXT_TEMPLATE`);
    // Instruct 序列：历史行加前缀、末尾追加停止序列（先补一条玩家消息）
    h.run(`commitChat(currentChat,chat=>{chat.messages.push({role:'user',text:'今晚的雨真大。'});})`);
    h.run(`presets[0].instruct = {enabled:true,input:'USER: ',output:'CHAR: ',system:'SYS: ',stop:'USER:'}`);
    const history = h.run(`historyLines(currentChat,8,promptCharBudget,scanLore(currentChat))`);
    assert.match(history.text, /USER: /);
    assert.match(history.text, /CHAR: /);
    assert.ok(history.text.trim().endsWith('USER:'), '停止序列追加在历史块末尾');
    h.run(`presets[0].instruct = {enabled:false,input:'',output:'',system:'',stop:''}`);
    const plain = h.run(`historyLines(currentChat,8,promptCharBudget,scanLore(currentChat))`);
    assert.ok(!plain.text.includes('USER: '), '关闭后不加前缀');
    // ST 导入：story_string 转模板 + 序列映射
    const imported = h.run(`(() => { const preset = parsePresetImport(JSON.stringify({name:'ST 模板预设',story_string:'{{#if description}}{{description}}\\n{{/if}}{{#if personality}}{{personality}}\\n{{/if}}{{#if scenario}}{{scenario}}{{/if}}',input_sequence:'USER: ',output_sequence:'CHAR: ',system_sequence:'SYS: ',stop_sequence:'USER:',prompts:[]})); return JSON.stringify({template:preset.contextTemplate,instruct:preset.instruct}); })()`);
    const data = JSON.parse(imported);
    assert.match(data.template, /\{\{description\}\}/);
    assert.match(data.template, /\{\{scenario\}\}/);
    assert.ok(!data.template.includes('{{#if'), 'handlebars 条件被去掉');
    assert.equal(data.instruct.enabled, true);
    assert.equal(data.instruct.input, 'USER: ');
    assert.equal(data.instruct.stop, 'USER:');
});

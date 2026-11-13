'use strict';
// 世界书扫描引擎：对照 SillyTavern 1.19.0 world-info.js（checkWorldInfo / WorldInfoBuffer / WorldInfoTimedEffects）。
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

// 设定会话：若干条消息 + 若干条会话世界书条目。消息按时间顺序给出。
function setup(h, messages, lore) {
    h.run(`commitChat(currentChat, chat => {
        chat.messages = normalizeMessages(${JSON.stringify(messages)});
        chat.context.lore = ${JSON.stringify(lore)};
    })`);
}
const titles = (h, expr = 'scanLore(currentChat)') => [...h.run(`${expr}.entries.map(entry => entry.title)`)];
const entry = (fields) => ({ enabled: true, priority: 0, ...fields });

test('次要关键词四种逻辑与 ST 一致', () => {
    const h = chatPage();
    const messages = [{ role: 'user', text: '我在钟楼下等你，带着那封信。' }];
    const cases = [
        ['andAny', ['信', '伞'], true], ['andAny', ['伞', '灯'], false],
        ['andAll', ['信', '钟楼'], true], ['andAll', ['信', '伞'], false],
        ['notAny', ['伞', '灯'], true], ['notAny', ['信', '灯'], false],
        ['notAll', ['信', '伞'], true], ['notAll', ['信', '钟楼'], false],
    ];
    for (const [logic, secondary, expected] of cases) {
        setup(h, messages, [entry({ id: 'e', title: '条目', keywords: ['等你'], secondaryKeywords: secondary, logic, text: '内容' })]);
        assert.equal(titles(h).length === 1, expected, `${logic} ${secondary.join('/')}`);
    }
});

test('主关键词不命中时不检查次要关键词；selective 关闭时忽略次要关键词', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '下雨了。' }], [entry({ id: 'a', title: '甲', keywords: ['钟楼'], secondaryKeywords: ['雨'], logic: 'notAny', text: 'x' })]);
    assert.deepEqual(titles(h), [], 'NOT ANY 也要先命中主关键词');
    setup(h, [{ role: 'user', text: '钟楼下雨了。' }], [entry({ id: 'b', title: '乙', keywords: ['钟楼'], secondaryKeywords: ['伞'], logic: 'andAll', selective: false, text: 'x' })]);
    assert.deepEqual(titles(h), ['乙']);
});

test('角色卡条目 selective 缺省为关闭（ST convertCharacterBook）', () => {
    const h = chatPage();
    const card = h.run(`normalizeLoreEntry({keys:['钟楼'],secondary_keys:['伞'],content:'x',insertion_order:5})`);
    assert.equal(card.selective, false);
    assert.equal(card.position, 'after', '卡内条目没有 position 时按 ST 记为角色之后');
    assert.equal(card.priority, 5);
    const world = h.run(`normalizeLoreEntry({key:['钟楼'],keysecondary:['伞'],content:'x',order:7,position:4,depth:2,role:1,selectiveLogic:3})`);
    assert.equal(world.selective, true);
    assert.equal(world.position, 'depth');
    assert.equal(world.depth, 2);
    assert.equal(world.role, 'user');
    assert.equal(world.logic, 'andAll');
    assert.equal(world.priority, 7);
});

test('扫描深度：只看最近 N 条，条目可覆盖全局深度', () => {
    const h = chatPage();
    const messages = [{ role: 'user', text: '旧城的邮局。' }, { role: 'assistant', text: '嗯。' }, { role: 'user', text: '走吧。' }];
    setup(h, messages, [entry({ id: 'a', title: '邮局', keywords: ['邮局'], text: 'x' })]);
    assert.deepEqual(titles(h, `scanLore(currentChat,{settings:{...loreSettings,scanDepth:2}})`), [], '邮局在第 3 新的消息里');
    assert.deepEqual(titles(h, `scanLore(currentChat,{settings:{...loreSettings,scanDepth:3}})`), ['邮局']);
    setup(h, messages, [entry({ id: 'a', title: '邮局', keywords: ['邮局'], text: 'x', scanDepth: 3 })]);
    assert.deepEqual(titles(h, `scanLore(currentChat,{settings:{...loreSettings,scanDepth:1}})`), ['邮局'], '条目扫描深度优先');
});

test('大小写、整词与 /正则/ 关键词', () => {
    const h = chatPage();
    const messages = [{ role: 'user', text: 'I met Alice at the station.' }];
    setup(h, messages, [entry({ id: 'a', title: '大写', keywords: ['alice'], text: 'x', caseSensitive: true })]);
    assert.deepEqual(titles(h), [], '区分大小写时 alice ≠ Alice');
    setup(h, messages, [entry({ id: 'a', title: '整词', keywords: ['stat'], text: 'x', matchWholeWords: true })]);
    assert.deepEqual(titles(h), [], '整词匹配时 stat 不命中 station');
    setup(h, messages, [entry({ id: 'a', title: '子串', keywords: ['stat'], text: 'x', matchWholeWords: false })]);
    assert.deepEqual(titles(h), ['子串']);
    setup(h, messages, [entry({ id: 'a', title: '正则', keywords: ['/al(i|y)ce/i'], text: 'x' })]);
    assert.deepEqual(titles(h), ['正则']);
    setup(h, [{ role: 'user', text: '钟楼下。' }], [entry({ id: 'a', title: '中文整词', keywords: ['钟楼'], text: 'x', matchWholeWords: true })]);
    assert.deepEqual(titles(h), ['中文整词'], '中文字符属于 \\W，整词匹配对中文照常生效');
});

test('关键词可扫描角色与身份资料（matchCharacter / matchPersona）', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '你好。' }], [entry({ id: 'a', title: '资料', keywords: ['都市夜行'], text: 'x' })]);
    h.run(`commitChat(currentChat, chat => { chat.personaId = 'night'; })`);
    h.run(`personas.find(p => p.id === 'night').description = '都市夜行的记者'`);
    assert.deepEqual(titles(h, `scanLore(currentChat,{settings:{...loreSettings,includeNames:false}})`), [], '默认不扫描身份资料');
    h.run(`commitChat(currentChat, chat => { chat.context.lore[0].matchPersona = true; })`);
    assert.deepEqual(titles(h, `scanLore(currentChat,{settings:{...loreSettings,includeNames:false}})`), ['资料']);
});

test('系统记录与隐藏消息不参与扫描', () => {
    const h = chatPage();
    setup(h, [{ role: 'system', text: '系统提到钟楼。' }, { role: 'user', text: '钟楼？', hidden: true }, { role: 'user', text: '没什么。' }],
        [entry({ id: 'a', title: '钟楼', keywords: ['钟楼'], text: 'x' })]);
    assert.deepEqual(titles(h), []);
});

test('概率：随机数决定是否进入，失败会记入原因', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '半数', keywords: ['钟楼'], text: 'x', probability: 50 })]);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0.4})'), ['半数']);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0.6})'), []);
    assert.match(h.run('scanLore(currentChat,{random:() => 0.6}).log.map(item => item.reason).join()'), /概率 50%/);
    h.run(`commitChat(currentChat, chat => { chat.context.lore[0].useProbability = false; })`);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0.99})'), ['半数'], '关闭概率后总是进入');
});

test('默认随机按会话与消息数播种：同一轮结果稳定', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '半数', keywords: ['钟楼'], text: 'x', probability: 50 })]);
    const first = titles(h);
    for (let index = 0; index < 5; index += 1) assert.deepEqual(titles(h), first);
});

test('包含组：组内只留一个；组内优先 > 权重随机', () => {
    const h = chatPage();
    const lore = [
        entry({ id: 'a', title: '晴', keywords: ['天气'], text: '晴', group: '天气', groupWeight: 100, priority: 5 }),
        entry({ id: 'b', title: '雨', keywords: ['天气'], text: '雨', group: '天气', groupWeight: 300, priority: 1 }),
    ];
    setup(h, [{ role: 'user', text: '今天天气怎样？' }], lore);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0.1})'), ['晴'], '0.1 × 400 = 40 落在「晴」的 100 权重内');
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0.5})'), ['雨']);
    setup(h, [{ role: 'user', text: '今天天气怎样？' }], [lore[0], { ...lore[1], groupOverride: true }]);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0.1})'), ['雨'], '组内优先的条目总是胜出');
});

test('包含组评分：命中关键词更多的条目胜出', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼下的邮局。' }], [
        entry({ id: 'a', title: '一个词', keywords: ['钟楼'], text: 'x', group: 'g' }),
        entry({ id: 'b', title: '两个词', keywords: ['钟楼', '邮局'], text: 'y', group: 'g' }),
    ]);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{random:() => 0,settings:{...loreSettings,useGroupScoring:true}})'), ['两个词']);
});

test('递归：已激活条目的正文可以触发其他条目；可阻止或排除', () => {
    const h = chatPage();
    const lore = [
        entry({ id: 'a', title: '邮局', keywords: ['邮局'], text: '邮局在钟楼旁边。', priority: 2 }),
        entry({ id: 'b', title: '钟楼', keywords: ['钟楼'], text: '钟楼每晚十点敲钟。', priority: 1 }),
    ];
    setup(h, [{ role: 'user', text: '去邮局。' }], lore);
    assert.deepEqual(titles(h), ['邮局', '钟楼']);
    assert.ok(h.run('scanLore(currentChat).loops') >= 2);
    assert.deepEqual(titles(h, 'scanLore(currentChat,{settings:{...loreSettings,recursive:false}})'), ['邮局']);
    setup(h, [{ role: 'user', text: '去邮局。' }], [{ ...lore[0], preventRecursion: true }, lore[1]]);
    assert.deepEqual(titles(h), ['邮局'], '不触发递归');
    setup(h, [{ role: 'user', text: '去邮局。' }], [lore[0], { ...lore[1], excludeRecursion: true }]);
    assert.deepEqual(titles(h), ['邮局'], '不被递归触发');
    setup(h, [{ role: 'user', text: '去邮局。' }], [lore[0], { ...lore[1], delayUntilRecursion: 1 }]);
    assert.deepEqual(titles(h), ['邮局', '钟楼'], '仅递归触发的条目在第一层递归里进入');
    setup(h, [{ role: 'user', text: '钟楼。' }], [{ ...lore[1], delayUntilRecursion: 1 }]);
    assert.deepEqual(titles(h), [], '直接命中但要求递归时不进入');
});

test('生成类型过滤与 @@activate / @@dont_activate 标记', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '仅继续', keywords: ['钟楼'], text: 'x', triggers: ['continue'] })]);
    assert.deepEqual(titles(h), []);
    assert.deepEqual(titles(h, `scanLore(currentChat,{trigger:'continue'})`), ['仅继续']);
    setup(h, [{ role: 'user', text: '无关。' }], [entry({ id: 'a', title: '强制', keywords: ['钟楼'], text: '@@activate\n正文' })]);
    assert.deepEqual(titles(h), ['强制']);
    assert.equal(h.run('scanLore(currentChat).entries[0].text'), '正文', '标记行不进入上下文');
    setup(h, [{ role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '禁止', keywords: ['钟楼'], text: '@@dont_activate\n正文' })]);
    assert.deepEqual(titles(h), []);
});

test('预算：超出时省略并计数；忽略预算的条目仍可进入', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [
        entry({ id: 'a', title: '长', keywords: ['钟楼'], text: 'a'.repeat(1500), priority: 3 }),
        entry({ id: 'b', title: '超', keywords: ['钟楼'], text: 'b'.repeat(800), priority: 2 }),
        entry({ id: 'c', title: '豁免', keywords: ['钟楼'], text: 'c'.repeat(800), priority: 1, ignoreBudget: true }),
    ]);
    const scan = h.run('scanLore(currentChat)');
    assert.deepEqual([...scan.entries.map(item => item.title)], ['长', '豁免']);
    assert.equal(scan.overflowed, true);
    assert.equal(h.run('loreBudget(currentChat).truncated'), 1);
});

test('延迟：消息数不足时不触发', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '晚到', keywords: ['钟楼'], text: 'x', delay: 3 })]);
    assert.deepEqual(titles(h), []);
    setup(h, [{ role: 'user', text: '一' }, { role: 'assistant', text: '二' }, { role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '晚到', keywords: ['钟楼'], text: 'x', delay: 3 })]);
    assert.deepEqual(titles(h), ['晚到']);
});

test('粘滞与冷却：发送时登记，预览不写；聊天前进后生效与到期', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '粘', keywords: ['钟楼'], text: 'x', sticky: 2, cooldown: 2 })]);
    assert.equal(h.run('scanLore(currentChat).timed'), null, '预览不产生定时记录');
    const timed = h.run('scanLore(currentChat,{dryRun:false}).timed');
    assert.deepEqual({ ...timed.sticky['session.a'] }, { start: 1, end: 3, protected: false });
    h.run(`commitChat(currentChat, chat => { chat.context.loreTimed = ${JSON.stringify(timed)}; chat.messages.push(...normalizeMessages([{role:'assistant',text:'无关'}])); })`);
    assert.deepEqual(titles(h), ['粘'], '第 2 条：关键词已不在最新消息里？仍在扫描窗口内，且粘滞生效');
    assert.ok(h.run('scanLore(currentChat).sticky.length') === 1);
    h.run(`commitChat(currentChat, chat => { chat.messages = normalizeMessages([{role:'user',text:'无关'},{role:'assistant',text:'无关'},{role:'user',text:'无关'}]); })`);
    assert.deepEqual(titles(h), [], '第 3 条：粘滞到期，关键词也不在');
    assert.equal(h.run('scanLore(currentChat).cooldown.length'), 1, '粘滞到期立刻进入冷却');
});

test('冷却期间即使关键词命中也不进入', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '一' }, { role: 'user', text: '钟楼。' }], [entry({ id: 'a', title: '冷', keywords: ['钟楼'], text: 'x', cooldown: 3 })]);
    h.run(`commitChat(currentChat, chat => { chat.context.loreTimed = {sticky:{},cooldown:{'session.a':{start:1,end:4,protected:false}}}; })`);
    assert.deepEqual(titles(h), []);
    assert.match(h.run('scanLore(currentChat).log.map(item => item.reason).join()'), /冷却中/);
});

test('插入位置：角色前、角色后、作者注释前后、历史深度与出口', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.context.note = '慢一点。'; })`);
    h.run(`presets[0].system = '引用出口：{{outlet::回忆}}'`);
    setup(h, [{ role: 'user', text: '一' }, { role: 'assistant', text: '二' }, { role: 'user', text: '钟楼。' }], [
        entry({ id: 'a', title: '前', keywords: ['钟楼'], text: 'BEFORE', position: 'before' }),
        entry({ id: 'b', title: '后', keywords: ['钟楼'], text: 'AFTER', position: 'after' }),
        entry({ id: 'c', title: '注前', keywords: ['钟楼'], text: 'ANTOP', position: 'anTop' }),
        entry({ id: 'd', title: '深', keywords: ['钟楼'], text: 'DEPTH', position: 'depth', depth: 1 }),
        entry({ id: 'e', title: '出口', keywords: ['钟楼'], text: 'OUTLET', position: 'outlet', outletName: '回忆' }),
    ]);
    const prompt = h.run('assemblePrompt(currentChat)');
    const block = keyName => prompt.blocks.find(item => item.key === keyName).text;
    assert.ok(block('lore').includes('BEFORE'));
    assert.ok(!block('lore').includes('AFTER'));
    assert.ok(block('character').includes('AFTER'), '角色之后的条目跟在角色块里');
    assert.ok(block('note').indexOf('ANTOP') < block('note').indexOf('慢一点。'));
    const history = block('history').split('\n');
    assert.ok(history.at(-2).includes('DEPTH'), '深度 1：插在最新一条之前');
    assert.ok(history.at(-1).includes('钟楼。'));
    assert.ok(block('system').includes('引用出口：OUTLET'), '出口条目只在 {{outlet::名称}} 处展开');
    assert.ok(!block('lore').includes('OUTLET'));
});

test('发送时执行提示词里的 setvar，并登记粘滞', () => {
    const h = chatPage();
    h.run(`presets[0].system = '{{setvar::已读::是}}'`);
    setup(h, [{ role: 'assistant', text: '开始。' }], [entry({ id: 'a', title: '粘', keywords: ['钟楼'], text: 'x', sticky: 3 })]);
    h.fill('#message-input', '去钟楼。');
    h.click('#send-message');
    h.timers.at(-1)();
    assert.equal(h.run(`readVar(currentChat,'local','已读')`), '是', '预览说「发送时执行」，发送就真的执行');
    assert.ok(h.run(`currentChat.context.loreTimed.sticky['session.a']`), '发送登记了粘滞');
});

test('导出为 SillyTavern 格式后可再导入，字段不丢', () => {
    const h = chatPage();
    const source = {
        name: '往返', entries: {
            0: { uid: 0, key: ['钟楼'], keysecondary: ['雨'], selectiveLogic: 2, comment: '钟楼', content: '钟楼正文', order: 9, position: 4, depth: 2, role: 2,
                probability: 40, useProbability: true, group: '地标', groupWeight: 70, groupOverride: true, sticky: 2, cooldown: 1, delay: 3,
                scanDepth: 5, caseSensitive: true, matchWholeWords: false, excludeRecursion: true, preventRecursion: true, delayUntilRecursion: 2,
                ignoreBudget: true, triggers: ['normal', 'swipe'], disable: true, constant: false, selective: true },
        },
    };
    const book = h.run(`parseWorldInfo(${JSON.stringify(JSON.stringify(source))})`);
    const once = book.entries[0];
    assert.equal(once.enabled, false);
    assert.equal(once.logic, 'notAny');
    const exported = h.run(`loreBookToSillyTavern(parseWorldInfo(${JSON.stringify(JSON.stringify(source))}))`);
    const back = exported.entries[0];
    for (const field of ['selectiveLogic', 'order', 'position', 'depth', 'role', 'probability', 'groupWeight', 'sticky', 'cooldown', 'delay', 'scanDepth', 'caseSensitive', 'delayUntilRecursion', 'disable']) {
        assert.deepEqual(back[field], source.entries[0][field], field);
    }
    assert.deepEqual([...back.key], ['钟楼']);
    assert.deepEqual([...back.triggers], ['normal', 'swipe']);
    const again = h.run(`normalizeBookEntries(Object.values(${JSON.stringify(JSON.stringify(exported))} && JSON.parse(${JSON.stringify(JSON.stringify(exported))}).entries))`);
    assert.equal(again[0].group, '地标');
    assert.equal(again[0].position, 'depth');
});

test('角色卡 character_book 的 extensions 字段被读取', () => {
    const h = chatPage();
    const card = { spec: 'chara_card_v2', data: { name: '卡', character_book: { name: '卡内书', entries: [
        { keys: ['钟楼'], content: '正文', insertion_order: 3, enabled: true, position: 'before_char', secondary_keys: ['雨'], selective: true,
            extensions: { position: 4, depth: 1, selectiveLogic: 3, probability: 30, useProbability: true, group: 'g', sticky: 2, scan_depth: 6, match_whole_words: true } },
    ] } } };
    const book = h.run(`parseWorldInfo(${JSON.stringify(JSON.stringify(card))})`);
    assert.equal(book.name, '卡内书');
    const item = book.entries[0];
    assert.equal(item.position, 'depth', 'extensions.position 优先于 before_char');
    assert.equal(item.depth, 1);
    assert.equal(item.logic, 'andAll');
    assert.equal(item.probability, 30);
    assert.equal(item.sticky, 2);
    assert.equal(item.scanDepth, 6);
    assert.equal(item.matchWholeWords, true);
});

test('条目编辑器：保存高级字段并立即影响匹配', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼下雨了。' }], []);
    h.run('openLoreEditor(currentChat)');
    h.click('#lore-add');
    h.fill('#lore-title', '雨夜钟楼');
    h.fill('#lore-keywords', '钟楼');
    h.fill('#lore-text', '钟声在雨里传得很远。');
    h.fill('#lore-secondary', '晴');
    h.root.querySelector('#lore-logic').value = 'notAny';
    h.root.querySelector('#lore-position').value = 'depth';
    h.fill('#lore-depth', '0');
    h.fill('#lore-probability', '100');
    h.fill('#lore-group', '天气');
    h.confirm();
    const saved = h.run('currentChat.context.lore[0]');
    assert.equal(saved.logic, 'notAny');
    assert.deepEqual([...saved.secondaryKeywords], ['晴']);
    assert.equal(saved.position, 'depth');
    assert.equal(saved.depth, 0);
    assert.equal(saved.group, '天气');
    assert.deepEqual(titles(h), ['雨夜钟楼']);
    const history = h.run(`assemblePrompt(currentChat).blocks.find(block => block.key === 'history').text`);
    assert.ok(history.trim().split('\n').at(-1).includes('钟声在雨里'), '深度 0 插在最新一条之后');
});

test('出口位置必须填写名称', () => {
    const h = chatPage();
    h.run('openLoreEditor(currentChat)');
    h.click('#lore-add');
    h.fill('#lore-title', '出口');
    h.fill('#lore-keywords', '钟楼');
    h.fill('#lore-text', '正文');
    h.root.querySelector('#lore-position').value = 'outlet';
    assert.equal(h.confirm(), false);
    assert.equal(h.run('currentChat.context.lore.length'), 0);
});

test('全局扫描设置随存档保存', () => {
    const h = chatPage();
    h.run('openLoreEditor(currentChat)');
    h.click('#lore-settings');
    h.fill('#lore-set-depth', '4');
    h.fill('#lore-set-budget', '3000');
    h.root.querySelector('#lore-set-recursive').checked = false;
    h.confirm();
    assert.equal(h.run('loreSettings.scanDepth'), 4);
    const restored = harness(makeStorage({ [key]: h.storage.getItem(key) }), '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    assert.equal(restored.run('loreSettings.scanDepth'), 4);
    assert.equal(restored.run('loreSettings.budget'), 3000);
    assert.equal(restored.run('loreSettings.recursive'), false);
});

test('重新生成也是一次生成：执行 setvar，并按被重试消息之前的上下文扫描', () => {
    const h = chatPage();
    h.run(`presets[0].system = '{{incvar::生成次数}}'`);
    setup(h, [{ role: 'user', text: '去钟楼。' }, { role: 'assistant', text: '好。', simulation: true }],
        [entry({ id: 'a', title: '粘', keywords: ['钟楼'], text: 'x', sticky: 2 })]);
    h.run(`messageAction('regenerate', 1)`);
    assert.equal(h.run(`readVar(currentChat,'local','生成次数')`), '1');
    assert.ok(h.run(`currentChat.context.loreTimed.sticky['session.a']`), '重试的上下文里有「钟楼」，登记粘滞');
    assert.equal(h.run(`currentChat.context.loreTimed.sticky['session.a'].start`), 1, '计数按被重试消息之前的 1 条');
});

test('保存失败时全局变量随会话一起回滚', () => {
    const h = chatPage();
    h.run(`presets[0].system = '{{setglobalvar::世界::新城}}'`);
    h.run(`writeVar(currentChat,'global','世界','旧城')`);
    h.fill('#message-input', '继续。');
    h.click('#send-message');
    h.storage.fail = true;
    h.timers.at(-1)();
    assert.equal(h.run(`readVar(currentChat,'global','世界')`), '旧城');
});

test('上下文预览的世界书与组装结果一致，并列出未进入的原因', () => {
    const h = chatPage();
    setup(h, [{ role: 'user', text: '钟楼。' }], [
        entry({ id: 'a', title: '进入', keywords: ['钟楼'], text: '进入正文' }),
        entry({ id: 'b', title: '冷却', keywords: ['钟楼'], text: 'x', triggers: ['continue'] }),
    ]);
    h.run('openContextPreview(currentChat)');
    const body = h.modals.at(-1).body;
    assert.ok(body.includes('1 条进入上下文'));
    assert.ok(body.includes('未进入的条目'));
    assert.ok(body.includes('生成类型不符'));
});

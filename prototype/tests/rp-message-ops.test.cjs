'use strict';
// 消息操作与聊天记录互通：对照 SillyTavern 1.19.0（deleteMessage / deleteSwipe / hideChatMessageRange / continue / impersonate，
// 以及 src/endpoints/chats.js 的 .jsonl 与几种 .json 导入格式）。
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

function chatPage(search = '?chat=chat-lin-1') {
    const h = harness(undefined, search, 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    h.run('renderChat()');
    return h;
}
function seed(h, messages) {
    h.run(`commitChat(currentChat, chat => { chat.messages = normalizeMessages(${JSON.stringify(messages)}); }); drawMessages()`);
}
const texts = h => [...h.run('currentChat.messages.map(message => message.text)')];

test('删除：与 ST 删除模式一致，删掉选中消息及之后的全部消息', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '一' }, { role: 'user', text: '二' }, { role: 'assistant', text: '三' }, { role: 'user', text: '四' }]);
    h.run(`messageAction('delete', 1)`);
    assert.match(h.modals.at(-1).title, /3 条/);
    h.confirm();
    assert.deepEqual(texts(h), ['一']);
    assert.equal(h.run('currentChat.count'), 1);
});

test('删除最后一条只删这一条，并撤掉它写过的状态栏', () => {
    const h = chatPage();
    seed(h, [{ role: 'user', text: '走吧' }, { role: 'assistant', text: '好。\n\n【状态】\n轮次：1\n地点：钟楼' }]);
    h.run(`syncStatusVars(currentChat)`);
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '钟楼');
    h.run(`messageAction('delete', 1)`);
    assert.match(h.modals.at(-1).title, /删除这条消息/);
    h.confirm();
    assert.deepEqual(texts(h), ['走吧']);
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '');
});

test('删除失败时整体回滚', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '一' }, { role: 'user', text: '二' }]);
    h.run(`messageAction('delete', 0)`);
    h.storage.fail = true;
    assert.equal(h.confirm(), false);
    assert.deepEqual(texts(h), ['一', '二']);
});

test('隐藏：消息留在记录里，但不进入上下文、不参与世界书扫描', () => {
    const h = chatPage();
    seed(h, [{ role: 'user', text: '去钟楼。' }, { role: 'assistant', text: '好。' }]);
    h.run(`commitChat(currentChat, chat => { chat.context.lore = [{id:'a',title:'钟楼',keywords:['钟楼'],text:'x',enabled:true}]; })`);
    assert.equal(h.run('scanLore(currentChat).entries.length'), 1);
    h.run(`messageAction('hide', 0)`);
    assert.equal(h.run('currentChat.messages[0].hidden'), true);
    assert.equal(h.run('currentChat.messages.length'), 2, '不删除');
    assert.equal(h.run('scanLore(currentChat).entries.length'), 0, '不参与扫描');
    assert.ok(!h.run(`assemblePrompt(currentChat).blocks.find(block => block.key === 'history').text`).includes('去钟楼'), '不进入上下文');
    assert.ok(h.find('#messages').textContent.includes('已隐藏'), '页面上标出来');
    h.run(`messageAction('hide', 0)`);
    assert.equal(h.run('currentChat.messages[0].hidden'), false, '再点一次取消隐藏');
});

test('隐藏的回复不写状态栏', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '好。\n\n【状态】\n天气：雨' }]);
    h.run('syncStatusVars(currentChat)');
    assert.equal(h.run(`readVar(currentChat,'local','天气')`), '雨');
    h.run(`messageAction('hide', 0)`);
    assert.equal(h.run(`readVar(currentChat,'local','天气')`), '');
});

test('删除候选：与 ST 的 deleteSwipe 一致，最后一个候选不能删', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '乙', candidates: ['甲', '乙', '丙'], selectedCandidate: 1 }]);
    h.run(`messageAction('delete-candidate', 0)`);
    assert.deepEqual([...h.run('currentChat.messages[0].candidates')], ['甲', '丙']);
    assert.equal(h.run('currentChat.messages[0].text'), '丙', '删掉当前候选后选中原位置上的下一个');
    h.run(`messageAction('delete-candidate', 0)`);
    h.run(`messageAction('delete-candidate', 0)`);
    assert.deepEqual([...h.run('currentChat.messages[0].candidates')], ['甲']);
    assert.equal(h.toasts.at(-1)[1], 'err', '只剩一个时拒绝');
});

test('「更多」菜单列出复制、分支、隐藏、删除；有多个候选时才有「删除当前候选」', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '甲' }]);
    h.click('[data-message-action="more"]');
    const body = h.modals.at(-1).body;
    for (const label of ['复制', '从这里创建分支', '隐藏这条消息', '删除这条消息']) assert.ok(body.includes(label), label);
    assert.ok(!body.includes('删除当前候选'));
    seed(h, [{ role: 'assistant', text: '甲', candidates: ['甲', '乙'] }]);
    h.click('[data-message-action="more"]');
    assert.ok(h.modals.at(-1).body.includes('删除当前候选'));
    h.click('[data-menu-action="hide"]');
    assert.equal(h.run('currentChat.messages[0].hidden'), true);
});

test('继续剧情：ST 的 continue 追加到最后一条角色回复，不插入伪玩家消息', () => {
    const h = chatPage();
    seed(h, [{ role: 'user', text: '然后呢？' }, { role: 'assistant', text: '她停了一下。\n\n【状态】\n轮次：3' }]);
    h.click('#continue-message');
    h.timers.at(-1)();
    assert.equal(h.run('currentChat.messages.length'), 2, '没有新增消息');
    const last = h.run('currentChat.messages[1]');
    assert.ok(last.text.startsWith('她停了一下。'), '原文保留在前');
    assert.equal((last.text.match(/【状态】/g) || []).length, 1, '状态块只有一个，放在末尾');
    assert.ok(last.text.includes('轮次：3'), '续写不算新的一轮');
    assert.equal(last.candidates.length, 1, '改的是当前候选，不新增候选');
    assert.ok(!h.run('currentChat.messages.some(message => message.text.includes("请继续"))'));
});

test('继续剧情：最后一条是玩家消息时生成新回复', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '开场。' }, { role: 'user', text: '我等你说完。' }]);
    h.click('#continue-message');
    h.timers.at(-1)();
    assert.equal(h.run('currentChat.messages.length'), 3);
    assert.equal(h.run('currentChat.messages[2].role'), 'assistant');
});

test('代写：写进输入框、不发送、不进历史；输入框已有草稿时先确认', () => {
    const h = chatPage();
    const before = h.run('currentChat.messages.length');
    h.click('#impersonate-message');
    const draft = h.find('#message-input').value;
    assert.ok(draft.length > 0);
    assert.equal(h.run('currentChat.messages.length'), before, '不会自动发出');
    h.fill('#message-input', '我自己写的');
    h.click('#impersonate-message');
    assert.match(h.modals.at(-1).title, /替换/);
    assert.equal(h.find('#message-input').value, '我自己写的', '确认前不覆盖');
    h.confirm();
    assert.notEqual(h.find('#message-input').value, '我自己写的');
});

test('代写按「代写」生成类型扫描世界书并执行宏', () => {
    const h = chatPage();
    h.run(`presets[0].system = '{{incvar::代写次数}}'`);
    seed(h, [{ role: 'user', text: '钟楼。' }]);
    h.run(`commitChat(currentChat, chat => { chat.context.lore = [{id:'a',title:'仅代写',keywords:['钟楼'],text:'x',enabled:true,sticky:2,triggers:['impersonate']}]; })`);
    h.click('#impersonate-message');
    assert.equal(h.run(`readVar(currentChat,'local','代写次数')`), '1');
    assert.ok(h.run(`currentChat.context.loreTimed.sticky['session.a']`), '只在代写触发的条目被登记');
});

test('导出 ST .jsonl：首行是 ST 的头，消息带 swipes、隐藏记为 is_system', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '乙', candidates: ['甲', '乙'], selectedCandidate: 1 }, { role: 'user', text: '藏起来', hidden: true }]);
    const lines = h.run('chatToSillyTavern(currentChat)').split('\n').map(line => JSON.parse(line));
    assert.equal(lines[0].user_name, 'unused');
    assert.equal(lines[0].character_name, 'unused');
    assert.ok(lines[0].chat_metadata.cai_story, '本平台的会话信息放进 chat_metadata');
    assert.equal(lines[1].mes, '乙');
    assert.deepEqual(lines[1].swipes, ['甲', '乙']);
    assert.equal(lines[1].swipe_id, 1);
    assert.equal(lines[1].is_user, false);
    assert.equal(lines[2].is_user, true);
    assert.equal(lines[2].is_system, true, 'ST 的 /hide 就是 is_system');
});

test('导出后再导入：消息、候选、隐藏、身份与会话信息都能还原', () => {
    const h = chatPage();
    seed(h, [{ role: 'assistant', text: '乙', candidates: ['甲', '乙'], selectedCandidate: 1 }, { role: 'user', text: '藏起来', hidden: true, personaSnapshot: { name: '旅人', initial: '旅', hue: 20 } }]);
    h.run(`commitChat(currentChat, chat => { chat.context.memory = '记得那封信'; chat.context.vars = {天气:'雨'}; })`);
    const exported = h.run('chatToSillyTavern(currentChat)');
    const parsed = h.run(`parseChatImport(${JSON.stringify(exported)})`);
    assert.equal(parsed.format, 'jsonl');
    const chat = h.run(`importChatRecord('lin-wanzhao', parseChatImport(${JSON.stringify(exported)}), '三年之后.jsonl')`);
    assert.equal(chat.messages.length, 2);
    assert.deepEqual([...chat.messages[0].candidates], ['甲', '乙']);
    assert.equal(chat.messages[0].text, '乙');
    assert.equal(chat.messages[1].hidden, true);
    assert.equal(chat.messages[1].personaSnapshot.name, '旅人');
    assert.equal(chat.context.memory, '记得那封信');
    assert.equal(chat.context.vars['天气'], '雨');
    assert.match(chat.title, /导入/);
    assert.ok(h.run(`chats.some(item => item.id === ${JSON.stringify(chat.id)})`), '成为一条新故事');
});

test('导入原生 ST .jsonl：is_system 无 extra.type 视为隐藏，Chub 的 {message} 被展开', () => {
    const h = chatPage();
    const st = [
        { user_name: 'unused', character_name: 'unused', chat_metadata: { note_prompt: '慢一点', variables: { 好感: '3' } } },
        { name: '林晚照', is_user: false, is_system: false, mes: '你来了。', swipes: ['你来了。', '你终于来了。'], swipe_id: 0, extra: {} },
        { name: 'User', is_user: true, is_system: false, mes: '嗯。', extra: {} },
        { name: 'User', is_user: true, is_system: true, mes: '这条被隐藏了。', extra: {} },
        { name: 'System', is_user: false, is_system: true, mes: '旁白。', extra: { type: 'narrator' } },
        { name: '林晚照', is_user: false, mes: { message: 'Chub 格式' }, swipes: [{ message: 'Chub 格式' }], extra: {} },
    ].map(line => JSON.stringify(line)).join('\n');
    const parsed = h.run(`parseChatImport(${JSON.stringify(st)})`);
    const roles = [...parsed.messages.map(message => message.role)];
    assert.deepEqual(roles, ['assistant', 'user', 'user', 'system', 'assistant']);
    assert.equal(parsed.messages[2].hidden, true);
    assert.equal(parsed.messages[3].hidden, false);
    assert.equal(parsed.messages[4].text, 'Chub 格式');
    assert.equal(parsed.messages[1].personaSnapshot.name, 'User');
    const chat = h.run(`importChatRecord('lin-wanzhao', parseChatImport(${JSON.stringify(st)}))`);
    assert.equal(chat.context.note, '慢一点', 'ST 的作者注释读进来');
    assert.equal(chat.context.vars['好感'], '3', 'ST 的聊天变量读进来');
    assert.notEqual(chat.messages[0].simulation, true, '导入的回复不标成模板模拟');
});

test('导入 ST 支持的 .json：Agnai / ooba / RisuAI / CAI Tools', () => {
    const h = chatPage();
    const cases = [
        { messages: [{ userId: 'u1', msg: '你好' }, { msg: '你好呀' }] },
        { data_visible: [['你好', '你好呀']] },
        { type: 'risuChat', data: { message: [{ role: 'user', data: '你好' }, { role: 'char', data: '你好呀' }] } },
        { histories: { histories: [{ msgs: [{ src: { is_human: true }, text: '你好' }, { src: { is_human: false }, text: '你好呀' }] }] } },
    ];
    for (const data of cases) {
        const parsed = h.run(`parseChatImport(${JSON.stringify(JSON.stringify(data))})`);
        assert.deepEqual([...parsed.messages.map(message => [message.role, message.text].join(':'))], ['user:你好', 'assistant:你好呀'], JSON.stringify(data).slice(0, 30));
    }
    assert.equal(h.run(`parseChatImport('not a chat')`), null);
    assert.equal(h.run(`parseChatImport(${JSON.stringify(JSON.stringify({ hello: 1 }))})`), null);
});

test('兼容本平台旧版导出（story-metadata 首行）', () => {
    const h = chatPage();
    const legacy = [{ type: 'story-metadata', version: 1, title: '旧故事', context: { memory: '旧记忆' } }, { role: 'assistant', text: '旧回复', candidates: ['旧回复'], selectedCandidate: 0 }]
        .map(line => JSON.stringify(line)).join('\n');
    const chat = h.run(`importChatRecord('lin-wanzhao', parseChatImport(${JSON.stringify(legacy)}))`);
    assert.equal(chat.messages[0].text, '旧回复');
    assert.equal(chat.context.memory, '旧记忆');
    assert.match(chat.title, /^旧故事/);
});

test('对话列表的导入入口：按所选角色导入并跳到新故事', () => {
    const h = harness(undefined, '', 'chats.html', 'chats', { 'rp-view-mode': 'classic' });
    h.run('renderChats()');
    h.click('#chat-import');
    assert.equal(h.modals.at(-1).title, '导入聊天记录');
    h.root.querySelector('#chat-import-character').value = 'bai-lu';
    h.fill('#chat-import-text', JSON.stringify({ messages: [{ userId: 'u', msg: '师父' }, { msg: '回来就好。' }] }));
    h.confirm();
    return new Promise(resolve => setTimeout(resolve, 20)).then(() => {
        const saved = JSON.parse(h.storage.getItem(key));
        const chat = saved.chats.at(-1);
        assert.equal(chat.characterId, 'bai-lu');
        assert.equal(chat.messages.length, 2);
        assert.match(h.location.href, /chat\.html\?chat=/);
    });
});

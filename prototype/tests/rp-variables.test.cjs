'use strict';
// 变量、宏与状态栏：会话/全局变量、宏解析（dry run 与 commit）、状态块解析与显示开关。
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

const withVars = (h, values) => h.run(`commitChat(currentChat, chat => { chat.context.vars = ${JSON.stringify(values)}; })`);

test('变量归一化：丢弃空键、截断超长值、限制数量', () => {
    const h = chatPage();
    const vars = h.run(`normalizeVars({'  时间 ':'雨夜', '':'丢弃', '${'k'.repeat(60)}':'x', '长':'${'v'.repeat(2100)}', '数字':7})`);
    assert.deepEqual(Object.keys(vars), ['时间', 'k'.repeat(40), '长', '数字']);
    assert.equal(vars['时间'], '雨夜');
    assert.equal(vars['长'].length, 2000);
    assert.equal(vars['数字'], '7', '数字会被转成字符串');
    assert.deepEqual([...Object.keys(h.run(`normalizeVars('not an object')`))], []);
    const many = Object.fromEntries(Array.from({ length: 80 }, (unused, index) => [`k${index}`, 'v']));
    assert.equal(h.run(`Object.keys(normalizeVars(${JSON.stringify(many)})).length`), 60);
});

test('getvar 读取会话变量，未设置时返回空串', () => {
    const h = chatPage();
    withVars(h, { 时间: '雨夜', 地点: '旧城邮局' });
    assert.equal(h.run(`resolveMacros('现在是{{getvar::时间}}。',currentChat).text`), '现在是雨夜。');
    assert.equal(h.run(`resolveMacros('{{getvar::没有这个键}}',currentChat).text`), '');
});

test('char 与 user 宏取角色名与玩家身份名，未知宏原样保留', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.personaId = 'night'; })`);
    const personaName = h.run('getPersona(currentChat.personaId).name');
    const characterName = h.run('chatCharacter(currentChat).name');
    const result = h.run(`resolveMacros('{{char}} 对 {{user}} 说，还有 {{unknownmacro::x}}。',currentChat)`);
    assert.ok(result.text.startsWith(`${characterName} 对 ${personaName} 说`));
    assert.ok(result.text.includes('{{unknownmacro::x}}'), '未知宏保持原样，与 SillyTavern 一致');
    assert.deepEqual([...result.unknown], ['unknownmacro']);
});

test('setvar 与 incvar 在预览时只读，commit 时才写入', () => {
    const h = chatPage();
    const preview = h.run(`resolveMacros('{{setvar::地点::钟楼}}{{incvar::好感}}',currentChat)`);
    assert.equal(preview.text, '1', 'incvar 在预览里返回值但不写库');
    assert.equal(preview.actions.length, 2);
    assert.equal(h.run(`Object.keys(chatVars(currentChat)).length`), 0, '预览不应产生任何写入');
    const applied = h.run(`resolveMacros('{{setvar::地点::钟楼}}{{incvar::好感}}',currentChat,{commit:true})`);
    assert.equal(applied.text, '1');
    assert.equal(h.run(`chatVars(currentChat)['地点']`), '钟楼');
    assert.equal(h.run(`chatVars(currentChat)['好感']`), '1');
    assert.equal(h.run(`resolveMacros('{{incvar::好感}}再{{decvar::好感}}',currentChat,{commit:true}).text`), '2再1');
});

test('非数字变量按 0 起算自增', () => {
    const h = chatPage();
    withVars(h, { 好感: '很高' });
    assert.equal(h.run(`resolveMacros('{{incvar::好感}}',currentChat,{commit:true}).text`), '1');
});

test('全局变量跨会话共享，本地与全局互不干扰', () => {
    const h = chatPage();
    h.run(`resolveMacros('{{setglobalvar::世界::旧城}}{{setvar::地点::邮局}}',currentChat,{commit:true})`);
    assert.equal(h.run(`readVar(currentChat,'global','世界')`), '旧城');
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '邮局');
    assert.equal(h.run(`resolveMacros('{{getglobalvar::世界}}/{{getvar::世界}}',currentChat).text`), '旧城/');
    assert.equal(h.run(`writeVar(currentChat,'global','世界','新城')`), '世界');
    assert.equal(h.run(`resolveMacros('{{getglobalvar::世界}}',currentChat).text`), '新城');
});

test('组装提示词时解析宏，并报告待执行的写操作', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => {
        chat.context.memory = '地点是{{getvar::地点}}。';
        chat.context.vars = { 地点: '钟楼' };
    })`);
    h.run(`presets[0].system = '你是{{char}}，对面是{{user}}。{{setvar::已读::1}}'`);
    const prompt = h.run('assemblePrompt(currentChat)');
    assert.ok(prompt.text.includes('你是' + h.run('chatCharacter(currentChat).name')));
    assert.ok(prompt.text.includes('地点是钟楼。'), '记忆块里的 getvar 应被解析');
    assert.ok(!prompt.text.includes('{{setvar::已读::1}}'), 'setvar 宏不留在文本里');
    assert.equal(prompt.macroActions.length, 1);
    assert.equal(prompt.macroActions[0].kind, 'setvar');
    assert.equal(h.run(`readVar(currentChat,'local','已读')`), '', '预览不写库，由发送那一刻执行');
});

test('状态块解析：全角与半角冒号、空行结束、非法行终止', () => {
    const h = chatPage();
    const block = h.run(`parseStatusBlock('正文。\\n\\n【状态】\\n轮次：2\\n地点: 旧城邮局\\n好感：+1\\n\\n后续正文')`);
    assert.equal(block.found, true);
    assert.deepEqual([...block.entries.map(entry => [entry.key, entry.value])], [['轮次','2'],['地点','旧城邮局'],['好感','+1']]);
    assert.equal(h.run(`parseStatusBlock('普通消息，没有状态块。').found`), false);
    assert.equal(h.run(`parseStatusBlock('【状态】\\n没有冒号的一行').found`), false, '没有键值行就不算状态块');
    assert.equal(h.run(`parseStatusBlock('【状态】\\n 空格键 ： 值 ').entries[0].key`), '空格键');
    assert.equal(h.run(`parseStatusBlock('【状态】\\n 空格键 ： 值 ').entries[0].value`), '值');
    assert.equal(h.run(`parseStatusBlock('[状态]\\n时间：清晨').found`), true, '半角方括号也识别');
});

test('stripStatusBlock 只移除状态块，保留前后正文', () => {
    const h = chatPage();
    const text = '第一段。\n\n【状态】\n轮次：1\n\n最后一句。';
    assert.equal(h.run(`stripStatusBlock(${JSON.stringify(text)})`), '第一段。\n\n最后一句。');
    assert.equal(h.run(`stripStatusBlock('没有状态块')`), '没有状态块');
});

test('显示开关决定消息里是否展示状态块', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.messages.push({role:'assistant',text:'他点头。\\n\\n【状态】\\n轮次：3'}); })`);
    h.run('drawMessages()');
    const hidden = h.run(`document.querySelector('#messages').textContent`);
    assert.ok(hidden.includes('他点头。'));
    assert.ok(!hidden.includes('轮次：3'), '默认隐藏状态块');
    h.run('hideStatusBlock = false');
    h.run('drawMessages()');
    // 状态块现在渲染成状态卡片（key/value 分列），断言内容可见而不是原始冒号格式
    const shown = h.run(`document.querySelector('#messages').textContent`);
    assert.ok(shown.includes('轮次') && shown.includes('3'), '关掉开关后展示状态块内容');
});

test('发送回复会附带状态块并写回变量，轮次逐次递增', () => {
    const h = chatPage();
    h.fill('#message-input', '先看看这边。');
    h.click('#send-message');
    h.timers.at(-1)();
    const first = h.run('currentChat.messages.at(-1).text');
    assert.ok(first.includes('【状态】'), '模板回复带状态块');
    assert.ok(first.includes('轮次：1'));
    assert.equal(h.run(`readVar(currentChat,'local','轮次')`), '1');
    h.fill('#message-input', '继续往前。');
    h.click('#send-message');
    h.timers.at(-1)();
    assert.equal(h.run(`readVar(currentChat,'local','轮次')`), '2');
    assert.ok(h.run('currentChat.messages.at(-1).text').includes('轮次：2'));
});

test('状态块里的自定义变量会写回，并出现在状态栏与右栏', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.context.vars = { 时间: '雨夜' }; })`);
    h.fill('#message-input', '继续。');
    h.click('#send-message');
    h.timers.at(-1)();
    h.run('refreshChatContext()');
    const text = h.run(`document.querySelector('#rp-context').textContent`);
    assert.ok(text.includes('状态栏'));
    assert.ok(text.includes('时间'));
    assert.ok(text.includes('雨夜'));
    assert.ok(text.includes('轮次'));
    assert.ok(text.includes('2 个会话变量'), '右栏统计会话变量数量');
});

test('变量面板可新增、编辑、删除变量并切换状态块开关', () => {
    const h = chatPage();
    h.run('openVarEditor(currentChat)');
    const dialog = h.modals.at(-1);
    assert.equal(dialog.title, '变量与状态栏');
    assert.ok(dialog.body.includes('本会话变量'));
    assert.ok(dialog.body.includes('可用宏'));
    assert.ok(dialog.body.includes('{{getvar::键}}'));
    h.run(`document.querySelector('#var-new-local').click()`);
    h.root.querySelector('#var-key').value = '地点';
    h.root.querySelector('#var-value').value = '钟楼';
    h.confirm();
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '钟楼');

    // 改名 + 改值：不应留下旧键（测试替身的假 DOM 只支持单属性选择器）
    h.run(`document.querySelector('[data-var-key="地点"]').click()`);
    h.root.querySelector('#var-key').value = '位置';
    h.root.querySelector('#var-value').value = '钟楼三层';
    h.confirm();
    assert.equal(h.run(`readVar(currentChat,'local','位置')`), '钟楼三层');
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '');

    h.run(`document.querySelectorAll('[data-var-delete]')[0].click()`);
    h.confirm();
    assert.equal(h.run(`Object.keys(chatVars(currentChat)).length`), 0);

    h.run(`document.querySelector('#var-hide-block').checked = false; document.querySelector('#var-hide-block').dispatch('change')`);
    assert.equal(h.run('hideStatusBlock'), false);
});

test('会话变量、全局变量与显示开关随存档保存并恢复', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.context.vars = { 时间: '雨夜' }; })`);
    h.run(`writeVar(currentChat,'global','世界','旧城')`);
    h.run('hideStatusBlock = false');
    assert.equal(h.run('saveState()'), true);

    const restored = harness(makeStorage({ [key]: h.storage.getItem(key) }), '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    restored.run('renderChat()');
    assert.equal(restored.run(`readVar(currentChat,'local','时间')`), '雨夜');
    assert.equal(restored.run(`readVar(currentChat,'global','世界')`), '旧城');
    assert.equal(restored.run('hideStatusBlock'), false);
    restored.run('refreshChatContext()');
    assert.ok(restored.run(`document.querySelector('#rp-context').textContent`).includes('雨夜'));
});

function sendTurn(h, text) {
    h.fill('#message-input', text);
    h.click('#send-message');
    h.timers.at(-1)();
}

test('重新生成的候选同样附状态块，轮次沿用被替换的那一轮', () => {
    const h = chatPage();
    sendTurn(h, '第一轮。');
    sendTurn(h, '第二轮。');
    const index = h.run('currentChat.messages.length - 1');
    assert.equal(h.run(`readVar(currentChat,'local','轮次')`), '2');
    h.run(`messageAction('regenerate', ${index})`);
    const message = h.run(`currentChat.messages[${index}]`);
    assert.equal(message.candidates.length, 2);
    assert.ok(message.text.includes('【状态】'), '重试出来的候选也要带状态块');
    assert.ok(message.text.includes('轮次：2'), '同一轮的另一个版本，轮次不能变成 3');
    assert.equal(h.run(`readVar(currentChat,'local','轮次')`), '2');
});

test('切换候选时状态栏跟着当前候选走', () => {
    const h = chatPage();
    sendTurn(h, '开始。');
    const index = h.run('currentChat.messages.length - 1');
    h.run(`commitChat(currentChat, chat => { const item = chat.messages[${index}]; item.candidates.push('另一个版本。\\n\\n【状态】\\n轮次：1\\n地点：钟楼'); })`);
    h.run(`messageAction('next', ${index})`);
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '钟楼');
    h.run(`messageAction('previous', ${index})`);
    assert.equal(h.run(`readVar(currentChat,'local','地点')`), '', '切回原候选后，只在另一个候选里出现过的键要撤掉');
    assert.equal(h.run(`readVar(currentChat,'local','轮次')`), '1');
});

test('编辑消息里的状态块会重新解析，手动变量不受影响', () => {
    const h = chatPage();
    h.run(`writeVar(currentChat,'local','好感','5')`);
    sendTurn(h, '开始。');
    const index = h.run('currentChat.messages.length - 1');
    h.run(`messageAction('edit', ${index})`);
    assert.ok(h.modals.at(-1).body.includes('重新解析'));
    h.fill('#edit-message', '改写后的回复。\n\n【状态】\n轮次：1\n天气：小雨');
    h.confirm();
    assert.equal(h.run(`readVar(currentChat,'local','天气')`), '小雨');
    assert.equal(h.run(`readVar(currentChat,'local','好感')`), '5', '从未出现在状态块里的手动变量保留');
    h.run(`messageAction('edit', ${index})`);
    h.fill('#edit-message', '把状态块删掉的版本。');
    h.confirm();
    assert.equal(h.run(`readVar(currentChat,'local','天气')`), '', '状态块被删掉后，它写过的键撤掉');
    assert.equal(h.run(`readVar(currentChat,'local','好感')`), '5');
});

test('窄屏状态栏放在输入框上方，点击打开变量面板，无变量时隐藏', () => {
    const h = chatPage();
    h.run('refreshChatContext()');
    assert.equal(h.find('#rp-var-strip').hidden, true, '没有变量时不占位');
    sendTurn(h, '开始。');
    h.run('refreshChatContext()');
    const strip = h.find('#rp-var-strip');
    assert.equal(strip.hidden, false);
    assert.ok(strip.textContent.includes('轮次'));
    h.run(`document.querySelector('#rp-var-strip').querySelector('[data-context-action]').click()`);
    assert.equal(h.modals.at(-1).title, '变量与状态栏');
});

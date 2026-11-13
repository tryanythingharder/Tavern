'use strict';
// 宏、斜杠命令、快捷回复与 token 估算：对照 SillyTavern 1.19.0（macros/definitions、slash-commands.js、
// extensions/quick-reply 的 QuickReplySet.execute、tokenizers.js 的 guesstimate）。
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
const macro = (h, text, options = '{}') => h.run(`resolveMacros(${JSON.stringify(text)},currentChat,${options}).text`);
const send = (h, text) => { h.fill('#message-input', text); h.click('#send-message'); };

test('变量宏：addvar 数字相加、文字接在后面；has / delete；全局版本', () => {
    const h = chatPage();
    h.run(`writeVar(currentChat,'local','金币','10'); writeVar(currentChat,'local','名字','林')`);
    macro(h, '{{addvar::金币::5}}{{addvar::名字::晚照}}', '{commit:true}');
    assert.equal(h.run(`readVar(currentChat,'local','金币')`), '15');
    assert.equal(h.run(`readVar(currentChat,'local','名字')`), '林晚照');
    assert.equal(macro(h, '{{hasvar::金币}}/{{hasvar::没有}}'), 'true/false');
    macro(h, '{{deletevar::金币}}');
    assert.equal(h.run(`readVar(currentChat,'local','金币')`), '15', '预览不删');
    macro(h, '{{deletevar::金币}}', '{commit:true}');
    assert.equal(macro(h, '{{hasvar::金币}}'), 'false');
    macro(h, '{{incglobalvar::次数}}{{incglobalvar::次数}}', '{commit:true}');
    assert.equal(macro(h, '{{getglobalvar::次数}}'), '2');
});

test('角色与聊天宏：description / personality / lastMessage / lastUserMessage', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.messages = normalizeMessages([{role:'assistant',text:'开场'},{role:'user',text:'玩家说'},{role:'assistant',text:'角色答'},{role:'user',text:'藏起来',hidden:true}]); })`);
    assert.equal(macro(h, '{{lastMessage}}|{{lastUserMessage}}|{{lastCharMessage}}'), '角色答|玩家说|角色答', '隐藏的消息不算');
    assert.equal(macro(h, '{{lastMessageId}}'), '3');
    assert.ok(macro(h, '{{charPersonality}}').length >= 0);
    assert.equal(macro(h, '{{persona}}'), h.run('getPersona(currentChat.personaId).description'));
});

test('随机宏：random 用逗号或 :: 分隔；pick 在同一会话固定；roll 掷骰', () => {
    const h = chatPage();
    assert.equal(macro(h, '{{random::甲::乙::丙}}', '{random:() => 0.5}'), '乙');
    assert.equal(macro(h, '{{random::甲,乙,丙}}', '{random:() => 0.99}'), '丙', '只有一个参数时按逗号分（ST readSingleArgsRandomList）');
    const first = macro(h, '{{pick::春::夏::秋::冬}}');
    for (let index = 0; index < 5; index += 1) assert.equal(macro(h, '{{pick::春::夏::秋::冬}}'), first);
    assert.equal(macro(h, '{{roll::2d6}}', '{random:() => 0}'), '2');
    assert.equal(macro(h, '{{roll::d20+3}}', '{random:() => 0.999}'), '23');
    assert.equal(macro(h, '{{roll::abc}}'), '', '写法不对时为空（ST 同样）');
    assert.equal(h.run('rollDice("101d6")'), null, '骰子数量有上限');
});

test('时间与文本宏：日期格式、newline / space / reverse / trim / 注释', () => {
    const h = chatPage();
    const now = 'new Date(2026, 10, 5, 9, 7, 3)';
    assert.equal(macro(h, '{{isodate}} {{time}} {{weekday}}', `{now:${now}}`), '2026-11-05 09:07 星期四');
    assert.equal(macro(h, '{{datetimeformat::YYYY/MM/DD HH:mm:ss}}', `{now:${now}}`), '2026/11/05 09:07:03');
    assert.equal(macro(h, 'a{{newline::2}}b{{space::3}}c'), 'a\n\nb   c');
    assert.equal(macro(h, '{{reverse::天晴了}}'), '了晴天');
    assert.equal(macro(h, '前\n\n{{trim}}\n\n后'), '前后');
    assert.equal(macro(h, '保留{{// 给作者看的注释}}这段'), '保留这段');
    assert.equal(macro(h, '{{noop}}x'), 'x');
    assert.equal(macro(h, '{{if::条件}}原样'), '{{if::条件}}原样', '未支持的宏原样保留');
});

test('斜杠命令：/sys /send 不触发回复；/trigger 触发；未知命令不当消息发出', () => {
    const h = chatPage();
    const count = () => h.run('currentChat.messages.length');
    const before = count();
    send(h, '/sys 窗外开始下雨。');
    assert.equal(count(), before + 1);
    assert.equal(h.run('currentChat.messages.at(-1).role'), 'system');
    assert.equal(h.find('#message-input').value, '', '命令执行后清空输入框');
    send(h, '/send 我推开门。');
    assert.equal(h.run('currentChat.messages.at(-1).role'), 'user');
    assert.equal(h.run('busy'), false, '/send 不触发回复');
    send(h, '/trigger');
    assert.equal(h.run('busy'), true);
    h.timers.at(-1)();
    assert.equal(h.run('currentChat.messages.at(-1).role'), 'assistant');
    send(h, '/foo 不存在');
    assert.equal(h.find('#message-input').value, '/foo 不存在', '未知命令保留输入');
    assert.equal(h.toasts.at(-1)[1], 'err');
    send(h, '//这不是命令');
    assert.equal(h.run('currentChat.messages.at(-1).text'), '//这不是命令', '// 开头按普通消息');
});

test('斜杠命令：变量、隐藏、删除、掷骰、作者注释、帮助', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.messages = normalizeMessages([{role:'assistant',text:'一'},{role:'user',text:'二'},{role:'assistant',text:'三'}]); })`);
    send(h, '/setvar key=好感 3');
    assert.equal(h.run(`readVar(currentChat,'local','好感')`), '3');
    send(h, '/incvar 好感');
    assert.equal(h.run(`readVar(currentChat,'local','好感')`), '4');
    send(h, '/addvar key=好感 6');
    assert.equal(h.run(`readVar(currentChat,'local','好感')`), '10');
    send(h, '/getvar 好感');
    assert.match(h.toasts.at(-1)[0], /好感 = 10/);
    send(h, '/flushvar 好感');
    assert.equal(h.run(`readVar(currentChat,'local','好感')`), '');
    send(h, '/hide 0-1');
    assert.deepEqual([...h.run('currentChat.messages.map(m => Boolean(m.hidden))')], [true, true, false]);
    send(h, '/unhide 1');
    assert.equal(h.run('currentChat.messages[1].hidden'), false);
    send(h, '/hide 9');
    assert.equal(h.toasts.at(-1)[1], 'err', '序号越界报错');
    send(h, '/del 2');
    assert.equal(h.run('currentChat.messages.length'), 1);
    h.run('Math.random = () => 0');
    send(h, '/roll 3d6');
    assert.match(h.run('currentChat.messages.at(-1).text'), /掷了 3d6：3/);
    send(h, '/note 写慢一点');
    assert.equal(h.run('currentChat.context.note'), '写慢一点');
    send(h, '/help');
    assert.equal(h.modals.at(-1).title, '斜杠命令');
    send(h, '/r 1d4');
    assert.match(h.run('currentChat.messages.at(-1).text'), /1d4/, '别名 /r');
});

test('斜杠命令：/regenerate 与 /continue', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => { chat.messages = normalizeMessages([{role:'user',text:'嗯'},{role:'assistant',text:'回答',simulation:true}]); })`);
    send(h, '/regen');
    assert.equal(h.run('currentChat.messages.at(-1).candidates.length'), 2);
    send(h, '/continue');
    h.timers.at(-1)();
    assert.equal(h.run('currentChat.messages.length'), 2, '继续追加到最后一条');
});

test('快捷回复：普通文字直接发送；斜杠命令按命令执行；只放进输入框；拼接已有文字', () => {
    const h = chatPage();
    h.run(`quickReplies = normalizeQuickReplies({items:[{id:'qr-a',label:'动作',message:'*看向窗外*'},{id:'qr-b',label:'掷骰',message:'/roll 1d20'}]}); drawQuickReplies()`);
    assert.equal(h.find('#rp-qr-bar').hidden, false);
    const before = h.run('currentChat.messages.length');
    h.click('[data-qr="qr-a"]');
    assert.equal(h.run('currentChat.messages.at(-1).text'), '*看向窗外*');
    h.timers.at(-1)();
    h.click('[data-qr="qr-b"]');
    assert.match(h.run('currentChat.messages.at(-1).text'), /掷了 1d20/);
    assert.equal(h.run('currentChat.messages.length'), before + 3);
    h.run(`quickReplies = normalizeQuickReplies({...quickReplies,disableSend:true,injectInput:true})`);
    h.fill('#message-input', '我说');
    h.click('[data-qr="qr-a"]');
    assert.equal(h.find('#message-input').value, '我说 *看向窗外*', '拼在已有文字后面，不发送');
    h.run(`quickReplies = normalizeQuickReplies({...quickReplies,placeBeforeInput:true})`);
    h.fill('#message-input', '我说');
    h.click('[data-qr="qr-a"]');
    assert.equal(h.find('#message-input').value, '*看向窗外* 我说');
});

test('快捷回复编辑器：添加、删除、保存，并随存档恢复', () => {
    const h = chatPage();
    h.run(`openContextEditor(currentChat,'qr')`);
    assert.equal(h.modals.at(-1).title, '快捷回复');
    h.click('#qr-add');
    h.fill('#qr-label-0', '叹气');
    h.fill('#qr-message-0', '*叹了口气*');
    h.click('#qr-add');
    h.fill('#qr-message-1', '/sys 天黑了');
    h.click('#qr-add');
    h.click('[data-qr-remove="2"]');
    h.find('#qr-nosend').checked = true;
    h.confirm();
    assert.equal(h.run('quickReplies.items.length'), 2);
    assert.equal(h.run('quickReplies.disableSend'), true);
    const reload = harness(makeStorage({ [key]: h.storage.getItem(key) }), '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    reload.run('renderChat()');
    assert.equal(reload.run('quickReplies.items[0].label'), '叹气');
    assert.ok(reload.find('#rp-qr-bar').textContent.includes('叹气'));
});

test('token 估算：与 ST 的 guesstimate 一致（UTF-8 字节 ÷ 3.35 向上取整），并显示在预览里', () => {
    const h = chatPage();
    assert.equal(h.run(`estimateTokens('hello')`), 2, '5 字节');
    assert.equal(h.run(`estimateTokens('你好')`), 2, '6 字节');
    assert.equal(h.run(`estimateTokens('')`), 0);
    const prompt = h.run('assemblePrompt(currentChat)');
    assert.equal(prompt.tokens, h.run('estimateTokens(assemblePrompt(currentChat).text)'));
    h.run('openContextPreview(currentChat)');
    assert.match(h.modals.at(-1).body, /约 \d+ token/);
    assert.match(h.modals.at(-1).body, /3\.35/);
});

test('变量面板列出分组宏', () => {
    const h = chatPage();
    h.run('openVarEditor(currentChat)');
    const body = h.modals.at(-1).body;
    for (const name of ['{{addvar::键::值}}', '{{roll::1d20}}', '{{pick::甲::乙::丙}}', '{{lastUserMessage}}', '{{datetimeformat::YYYY-MM-DD HH:mm}}']) assert.ok(body.includes(name), name);
    assert.ok(body.includes('/help'));
});

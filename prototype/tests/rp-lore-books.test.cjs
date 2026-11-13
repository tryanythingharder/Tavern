'use strict';
// 多本世界书：导入解析、会话绑定、合并命中、预算截断与持久化。
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

const stWorld = {
    name: '旧城邮路',
    entries: {
        '0': { key: ['邮局', '信'], content: '邮局在钟楼旁边。', insertion_order: 3, comment: '邮局方位' },
        '1': { key: [], content: '这座城市常年下雨。', constant: true, insertion_order: 9, comment: '常驻气候' },
        '2': { key: ['停用'], content: '不会命中。', enabled: false, comment: '停用' },
    },
};

test('解析 SillyTavern 世界书 JSON（entries 对象）', () => {
    const h = chatPage();
    const book = h.run(`parseWorldInfo(${JSON.stringify(JSON.stringify(stWorld))})`);
    assert.equal(book.name, '旧城邮路');
    assert.equal(book.source, 'import');
    assert.equal(book.entries.length, 3);
    assert.deepEqual([...book.entries[0].keywords], ['邮局', '信']);
    assert.equal(book.entries[0].priority, 3);
    assert.equal(book.entries[1].constant, true);
    assert.equal(book.entries[2].enabled, false);
});

test('支持 entries 为数组的世界书 JSON', () => {
    const h = chatPage();
    const book = h.run(`parseWorldInfo(${JSON.stringify(JSON.stringify({ name: '极简世界', entries: [{ keys: ['夜'], content: '夜里的旧城。' }] }))})`);
    assert.equal(book.name, '极简世界');
    assert.equal(book.entries.length, 1);
});

test('空条目不会被导入', () => {
    const h = chatPage();
    assert.equal(h.run(`parseWorldInfo(${JSON.stringify(JSON.stringify({ name: '空', entries: {} }))})`), null);
    assert.equal(h.run(`parseWorldInfo('not json')`), null);
});

test('绑定世界书后会话命中合并；解绑后只剩会话条目', () => {
    const h = chatPage();
    h.run(`loreBooks.push(normalizeLoreBook({id:'book-a',name:'旧城邮路',source:'import',entries:normalizeBookEntries(${JSON.stringify(Object.values(stWorld.entries))})}));`);
    const before = h.run('activeLoreEntries(currentChat).length');
    assert.equal(before, 0);
    h.run(`commitChat(currentChat, chat => { chat.context.bookIds = ['book-a']; })`);
    assert.equal(h.run('activeLoreEntries(currentChat).length'), 2);
    const titles = h.run('loreMatches(currentChat).map(entry => entry.title)');
    assert.ok(titles.includes('常驻气候'), '常驻条目应命中');
    h.run(`commitChat(currentChat, chat => { chat.context.bookIds = []; })`);
    assert.equal(h.run('activeLoreEntries(currentChat).length'), 0);
    assert.equal(h.run('loreMatches(currentChat).length'), 0);
});

test('书内停用条目不参与命中', () => {
    const h = chatPage();
    h.run(`loreBooks.push(normalizeLoreBook({id:'book-b',name:'停用册',entries:normalizeBookEntries(${JSON.stringify(Object.values(stWorld.entries))})}));`);
    h.run(`commitChat(currentChat, chat => { chat.context.bookIds = ['book-b']; })`);
    const enabledCount = h.run('activeLoreEntries(currentChat).length');
    assert.equal(enabledCount, 2, '停用条目在归一化时应被过滤');
});

test('多本会话混合时按优先级排序', () => {
    const h = chatPage();
    // 关键词取种子消息里真实出现的字词（chat-lin-1 开场白含「请柬」），命中才有意义。
    h.run(`commitChat(currentChat, chat => {
        chat.context.lore = [{id:'session-lore',title:'会话条目',keywords:['请柬'],text:'会话内容',enabled:true,priority:1}];
        chat.context.bookIds = ['book-c'];
    })`);
    h.run(`loreBooks.push(normalizeLoreBook({id:'book-c',name:'高优先册',entries:[{id:'book-lore',title:'高优先条目',keywords:['请柬'],text:'高优先内容',enabled:true,priority:8}]}));`);
    const titles = h.run('loreMatches(currentChat).map(entry => entry.title)');
    assert.deepEqual([...titles], ['高优先条目', '会话条目']);
});

test('超出字符预算的条目被省略并计数', () => {
    const h = chatPage();
    h.run(`commitChat(currentChat, chat => {
        chat.context.lore = [
            {id:'l1',title:'一',keywords:['请柬'],text:'${'a'.repeat(1400)}',enabled:true,priority:3},
            {id:'l2',title:'二',keywords:['请柬'],text:'${'b'.repeat(1200)}',enabled:true,priority:2}
        ];
    })`);
    const budget = h.run('loreBudget(currentChat)');
    assert.equal(budget.entries.length, 1);
    assert.equal(budget.truncated, 1);
    assert.ok(budget.chars <= budget.budget);
});

test('世界书随存档保存并能在重新载入时恢复', () => {
    const h = chatPage();
    h.run(`loreBooks.push(normalizeLoreBook({id:'book-persist',name:'旧城邮路',source:'import',entries:normalizeBookEntries(${JSON.stringify(Object.values(stWorld.entries))})}));`);
    h.run(`commitChat(currentChat, chat => { chat.context.bookIds = ['book-persist']; })`);
    // 常驻条目恒命中；关键词条目需要消息里真的出现词，这里补一条含「邮局」的玩家消息。
    h.run(`commitChat(currentChat, chat => { chat.messages.push({role:'user',text:'我先去邮局看那封旧信。'}); })`);
    const raw = h.storage.getItem(key);
    const restored = harness(makeStorage({ [key]: raw }), '?chat=chat-lin-1', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    assert.equal(restored.run('loreBooks.length'), 1);
    assert.equal(restored.run('loreBooks[0].name'), '旧城邮路');
    assert.equal(restored.run('loreBooks[0].entries.length'), 3);
    restored.run('renderChat()');
    assert.equal(restored.run('boundBookIds(currentChat).length'), 1);
    assert.equal(restored.run('loreMatches(currentChat).length'), 2);
});

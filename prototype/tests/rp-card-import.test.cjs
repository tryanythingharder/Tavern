'use strict';
// 角色卡导入：PNG tEXt/chara、JSON 卡映射、世界书随卡落地、保存失败回滚。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const directory = path.resolve(__dirname, '..');
const harnessSource = fs.readFileSync(path.join(directory, 'rp-state.test.cjs'), 'utf8').split('\nfunction createFields(')[0];
const shared = { require, __dirname: directory, URL, URLSearchParams, console, atob, TextDecoder };
vm.runInNewContext(`${harnessSource}\nglobalThis.sharedHarness={harness};`, shared);
const { harness } = shared.sharedHarness;

const key = 'rp-platform-state';

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4, 0)]);
}

function buildCardPng(card) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
    const payload = Buffer.concat([
        Buffer.from('chara\0', 'latin1'),
        Buffer.from(Buffer.from(JSON.stringify(card), 'utf8').toString('base64'), 'latin1'),
    ]);
    return Buffer.concat([signature, ihdr, pngChunk('tEXt', payload), pngChunk('IEND', Buffer.alloc(0))]);
}

function injectBytes(h, bytes, name = '__png') {
    h.run(`globalThis.${name} = new Uint8Array(${JSON.stringify([...bytes])});`);
}

const v2Card = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
        name: '雨夜邮差',
        description: '在旧城送信的年轻人，记得每一封没寄出的信。',
        personality: '安静，记性极好',
        scenario: '雨夜的邮局',
        first_mes: '他把湿透的邮包放下：「有一封给你的信，寄了七年。」',
        creator_notes: '慢热叙事\n第二行不该出现在简介里',
        tags: ['现代', '悬疑'],
        creator: '本地测试',
        character_version: '1.2',
        character_book: {
            name: '旧城邮路',
            entries: [
                { keys: ['邮局', '信'], content: '邮局在钟楼旁边，夜里十点关门。', enabled: true, insertion_order: 5, comment: '邮局方位' },
                { keys: [], content: '这座城市常年下雨，人们习惯把伞挂在门后。', constant: true, insertion_order: 9, comment: '常驻气候' },
                { keys: ['空'], content: '', enabled: true },
                { keys: ['停用'], content: '不会出现', enabled: false },
            ],
        },
    },
};

test('PNG 的 tEXt/chara 能被解析成角色卡对象', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, buildCardPng(v2Card));
    const chunks = h.run('pngTextChunks(__png.buffer)');
    assert.equal(typeof chunks.chara, 'string');
    const card = h.run('cardFromChunks(pngTextChunks(__png.buffer))');
    assert.equal(card.spec, 'chara_card_v2');
    assert.equal(card.data.name, '雨夜邮差');
});

test('非 PNG 字节不会被误判成角色卡', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, Buffer.from('not a png at all'));
    assert.equal(h.run('pngTextChunks(__png.buffer)'), null);
    assert.equal(h.run('cardFromChunks(pngTextChunks(__png.buffer))'), null);
});

test('v2 卡片字段映射到作品结构，开场白与简介不被污染', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, buildCardPng(v2Card));
    const work = h.run('cardToWork(cardFromChunks(pngTextChunks(__png.buffer)), "data:image/jpeg;base64,AAA")');
    assert.equal(work.name, '雨夜邮差');
    assert.equal(work.greeting, v2Card.data.first_mes);
    assert.equal(work.personality, '安静，记性极好');
    assert.equal(work.scenario, '雨夜的邮局');
    assert.equal(work.hook, '慢热叙事');
    assert.ok(!work.hook.includes('\n'));
    assert.deepEqual([...work.tags], ['现代', '悬疑']);
    assert.equal(work.portrait, 'data:image/jpeg;base64,AAA');
    assert.equal(work.nsfw, false);
    assert.equal(work.cardSource.creator, '本地测试');
    assert.equal(work.cardSource.version, '1.2');
});

test('v1 扁平卡片同样可用，缺字段回退为空而不是 undefined', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    const work = h.run(`cardToWork(${JSON.stringify({ name: '旧卡', first_mes: '你好。', description: '一段描述' })})`);
    assert.equal(work.name, '旧卡');
    assert.equal(work.greeting, '你好。');
    assert.equal(work.personality, '');
    assert.equal(work.scenario, '');
    assert.deepEqual([...work.tags], []);
    assert.equal(work.loreBook, null);
    assert.equal(work.cardSource.spec, 'chara_card_v1');
});

test('卡片世界书保留关键词、常驻、优先级，并丢弃空内容', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, buildCardPng(v2Card));
    const work = h.run('cardToWork(cardFromChunks(pngTextChunks(__png.buffer)))');
    assert.equal(work.loreBook.name, '旧城邮路');
    assert.equal(work.loreBook.entries.length, 3);
    const [first, second, third] = work.loreBook.entries;
    assert.deepEqual([...first.keywords], ['邮局', '信']);
    assert.equal(first.priority, 5);
    assert.equal(first.constant, false);
    assert.equal(second.constant, true);
    assert.deepEqual([...second.keywords], []);
    assert.equal(third.enabled, false);
});

test('导入成功后作品可被 getCharacter 取到并写入存档', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, buildCardPng(v2Card));
    h.run('globalThis.__work = importCardWork(cardToWork(cardFromChunks(pngTextChunks(__png.buffer))))');
    const id = h.run('__work.id');
    assert.match(id, /^work-card/);
    const found = h.run(`getCharacter(${JSON.stringify(id)}).name`);
    assert.equal(found, '雨夜邮差');
    const stored = JSON.parse(h.storage.getItem(key));
    assert.ok(stored.creatorWorks.some(work => work.id === id), '导入作品应写入存档');
});

test('保存失败时导入整体回滚且不谎报成功', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, buildCardPng(v2Card));
    const before = h.storage.getItem(key);
    h.storage.fail = true;
    const result = h.run('importCardWork(cardToWork(cardFromChunks(pngTextChunks(__png.buffer))))');
    assert.equal(result, null);
    assert.equal(h.run('creatorWorks.length'), 0);
    assert.equal(h.storage.getItem(key), before);
    assert.match(h.toasts.at(-1)[0], /撤销|失败/);
});

test('缺少开场白的卡片被拒绝，不会产生空角色', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    const result = h.run(`importCardWork(cardToWork({ name:'没有开场' }))`);
    assert.equal(result, null);
    assert.equal(h.run('creatorWorks.length'), 0);
    assert.match(h.toasts.at(-1)[0], /开场白|名称/);
});

test('直接从卡片开新故事时，世界书随会话落地', () => {
    const h = harness(undefined, '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    injectBytes(h, buildCardPng(v2Card));
    h.run('globalThis.__work = importCardWork(cardToWork(cardFromChunks(pngTextChunks(__png.buffer))))');
    const id = h.run('__work.id');
    h.run(`newStory(${JSON.stringify(id)})`);
    const lore = h.run('chats.find(chat => chat.characterId === __work.id)?.context.lore.length');
    assert.equal(lore, 3);
    const constant = h.run(`chats.find(chat => chat.characterId === __work.id).context.lore.filter(entry => entry.constant).length`);
    assert.equal(constant, 1);
});

test('常驻世界书条目无需关键词命中也会进入上下文，并按优先级排序', () => {
    const h = harness(undefined, '', 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    h.run('renderChat()');
    h.run(`commitChat(currentChat, chat => {
        chat.context = { memory:'', note:'', lore:[
            { id:'lore-low', title:'低优先', keywords:['雨'], text:'低优先内容', enabled:true, priority:1 },
            { id:'lore-cold', title:'常驻气候', keywords:[], text:'常驻内容', enabled:true, constant:true, priority:9 }
        ]};
    })`);
    const matches = h.run('loreMatches(currentChat).map(entry => entry.title)');
    assert.deepEqual([...matches], ['常驻气候', '低优先']);
    const firstHit = h.run('loreMatches(currentChat)[0].hits[0].keyword');
    assert.equal(firstHit, '常驻');
});

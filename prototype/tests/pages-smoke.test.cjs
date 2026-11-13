'use strict';
// 页面级冒烟：真实生产闭包渲染每个页面，防止"能跑测试但整页白屏"的模板错误。
// 只做渲染与关键锚点检查，不复制页面实现。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const directory = path.resolve(__dirname, '..');
const harnessSource = fs.readFileSync(path.join(directory, 'rp-state.test.cjs'), 'utf8').split('\nfunction createFields(')[0];
const shared = { require, __dirname: directory, URL, URLSearchParams, console };
vm.runInNewContext(`${harnessSource}\nglobalThis.sharedHarness={harness};`, shared);
const { harness } = shared.sharedHarness;

const pages = [
    { file: 'home.html', search: '', markers: ['#app'] },
    { file: 'plaza.html', search: '', markers: ['#plaza-grid'] },
    { file: 'character.html', search: '?id=lin-wanzhao', markers: ['#start-chat', '#persona-select'] },
    { file: 'author.html', search: '?name=青梧', markers: ['#app'] },
    { file: 'chats.html', search: '', markers: ['#chat-list'] },
    { file: 'chat.html', search: '?chat=chat-lin-1', markers: ['#message-input', '#rp-context'] },
    { file: 'library.html', search: '', markers: ['#library-list'] },
    { file: 'create.html', search: '', markers: ['#character-form'] },
    { file: 'settings.html', search: '', markers: ['#app'] },
    { file: 'rooms.html', search: '', markers: ['#app'] },
    { file: 'notifications.html', search: '', markers: ['#app'] },
];

for (const { file, search, markers } of pages) {
    test(`${file} 渲染不抛错且关键锚点存在`, () => {
        const h = harness(undefined, search, file, file.replace('.html', ''), { 'rp-view-mode': 'classic' });
        assert.doesNotThrow(() => h.run('void 0'));
        const html = h.run('document.querySelector("#app").innerHTML');
        assert.ok(typeof html === 'string' && html.length > 200, `${file} 内容过短，可能白屏`);
        assert.ok(!/undefined|\[object Object\]|NaN/.test(html), `${file} 出现未定义值占位`);
        for (const marker of markers) {
            assert.ok(h.find(marker), `${file} 缺少 ${marker}`);
        }
        assert.equal(h.root.querySelectorAll('script').length, 0, `${file} 意外注入脚本`);
    });
}

test('未匹配的稳定选择器不会在经典首页残留旧结构', () => {
    const h = harness(undefined, '', 'home.html', 'home', { 'rp-view-mode': 'classic' });
    const html = h.run('document.querySelector("#app").innerHTML');
    assert.ok(html.includes('ca-home'), '经典首页应使用 C.AI 卡片流容器');
    assert.ok(!html.includes('p-hero'), '经典首页不应再渲染旧的 hero 结构');
    assert.ok(html.includes('ca-rec-row'), '经典首页应有推荐卡片行');
    assert.ok(html.includes('ca-grid'), '经典首页应有全部角色网格');
});

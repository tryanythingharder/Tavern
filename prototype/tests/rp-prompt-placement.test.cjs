'use strict';
// 作者注释、身份描述与自定义提示块的位置：对照 SillyTavern 1.19.0（authors-note.js 的 setFloatingPrompt、
// script.js 的 addPersonaDescriptionExtensionPrompt、PromptManager 的 injection_position / injection_depth / injection_order）。
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
function setup(h, messages, context = {}) {
    h.run(`commitChat(currentChat, chat => { chat.messages = normalizeMessages(${JSON.stringify(messages)}); Object.assign(chat.context, ${JSON.stringify(context)}); })`);
}
const block = (h, name) => h.run(`assemblePrompt(currentChat).blocks.find(block => block.key === ${JSON.stringify(name)})?.text || ''`);
const order = h => [...h.run('assemblePrompt(currentChat).blocks.filter(block => block.enabled && block.text).map(block => block.key)')];
const turns = n => Array.from({ length: n }, (_, index) => [{ role: 'user', text: `第${index + 1}句` }, { role: 'assistant', text: `回${index + 1}` }]).flat();

test('作者注释默认仍在作者注释块（旧会话不变）', () => {
    const h = chatPage();
    setup(h, turns(1), { note: '慢一点。' });
    assert.equal(h.run('noteSettings(currentChat).position'), 'block');
    assert.equal(block(h, 'note'), '慢一点。');
});

test('作者注释频率：按玩家消息数计算，与 ST 的 setFloatingPrompt 一致', () => {
    const h = chatPage();
    const at = (n, interval) => {
        setup(h, turns(n), { note: '提醒', noteSettings: { interval } });
        return h.run('noteActive(currentChat)');
    };
    assert.equal(at(1, 1).active, true, '频率 1 每轮都插入');
    assert.equal(at(1, 3).active, false);
    assert.equal(at(1, 3).remaining, 2, '1 条玩家消息、频率 3：还差 2 条');
    assert.equal(at(3, 3).active, true, '第 3 条玩家消息时插入');
    assert.equal(at(4, 3).active, false);
    assert.equal(at(6, 3).active, true);
    assert.equal(at(5, 0).active, false, '频率 0 关闭');
    setup(h, turns(4), { note: '提醒', noteSettings: { interval: 3 } });
    assert.equal(block(h, 'note'), '', '本轮不插入时作者注释块为空');
});

test('作者注释位置：主提示词之前 / 之后 / 聊天内按深度与身份', () => {
    const h = chatPage();
    setup(h, turns(3), { note: 'NOTE' });
    h.run(`commitChat(currentChat, chat => { chat.context.noteSettings = {position:'before'}; })`);
    let keys = order(h);
    assert.ok(keys.indexOf('note') < keys.indexOf('system'), '主提示词之前');
    h.run(`commitChat(currentChat, chat => { chat.context.noteSettings = {position:'after'}; })`);
    keys = order(h);
    assert.equal(keys.indexOf('note'), keys.indexOf('system') + 1, '紧跟主提示词之后');
    h.run(`commitChat(currentChat, chat => { chat.context.noteSettings = {position:'depth',depth:1,role:'user'}; })`);
    assert.equal(block(h, 'note'), '', '聊天内时不在作者注释块');
    const history = block(h, 'history').split('\n');
    const index = history.findIndex(line => line.includes('NOTE'));
    assert.ok(history[index].includes('作者注释 · 玩家 · 深度 1'));
    assert.ok(history[index + 1].includes('回3') && index + 2 === history.length, '深度 1：插在最新一条之前');
});

test('世界书「作者注释前/后」只在注释本轮插入时出现', () => {
    const h = chatPage();
    setup(h, turns(1).concat([{ role: 'user', text: '钟楼' }]), {
        note: 'NOTE', noteSettings: { interval: 5 },
        lore: [{ id: 'a', title: '注前', keywords: ['钟楼'], text: 'ANTOP', position: 'anTop', enabled: true }],
    });
    assert.ok(!h.run('assemblePrompt(currentChat).text').includes('ANTOP'), 'ST：shouldWIAddPrompt 为假时不加');
    h.run(`commitChat(currentChat, chat => { chat.context.noteSettings = {interval:1}; })`);
    assert.ok(block(h, 'note').indexOf('ANTOP') < block(h, 'note').indexOf('NOTE'));
});

test('身份描述位置：提示词里 / 作者注释前后 / 聊天内 / 不进入', () => {
    const h = chatPage();
    setup(h, turns(2), { note: 'NOTE' });
    const persona = h.run('getPersona(currentChat.personaId)');
    const place = fields => h.run(`savePersona(${JSON.stringify(persona.id)}, {...getPersona(${JSON.stringify(persona.id)}),...${JSON.stringify(fields)}})`);
    assert.ok(block(h, 'persona').includes(persona.description), '默认在身份块');
    place({ descriptionPosition: 'anTop' });
    assert.ok(!block(h, 'persona').includes(persona.description), '移出身份块');
    assert.ok(block(h, 'note').startsWith(persona.description), '贴在作者注释之前');
    place({ descriptionPosition: 'anBottom' });
    assert.ok(block(h, 'note').endsWith(persona.description));
    place({ descriptionPosition: 'depth', descriptionDepth: 0, descriptionRole: 'assistant' });
    const history = block(h, 'history').split('\n');
    assert.ok(history.at(-1).includes('玩家身份 · 角色 · 深度 0') && history.at(-1).includes(persona.description));
    place({ descriptionPosition: 'none' });
    assert.ok(!h.run('assemblePrompt(currentChat).text').includes(persona.description), '不进入上下文');
    assert.ok(block(h, 'persona').includes(persona.name), '名字仍在身份块');
});

test('身份绑定角色：没有会话的角色开新故事时默认用绑定的身份；已有会话时沿用最近会话的身份', () => {
    const h = harness(undefined, '?id=a-heng', 'character.html', 'character', { 'rp-view-mode': 'classic' });
    const saved = h.run(`savePersona(null, {name:'山下旅人', description:'从山下来的人。', boundCharacters:['a-heng','bai-lu']})`);
    h.run(`selectedPersona = 'night'`);
    h.run('renderCharacter()');
    assert.equal(h.find('#persona-select').value, saved.id);
    h.click('#new-story');
    assert.equal(JSON.parse(h.storage.getItem(key)).chats.at(-1).personaId, saved.id, '新故事用绑定的身份');
    const reload = harness(makeStorage({ [key]: h.storage.getItem(key) }), '?id=bai-lu', 'character.html', 'character', { 'rp-view-mode': 'classic' });
    reload.run('renderCharacter()');
    assert.equal(reload.find('#persona-select').value, 'wuxia', '白露已有会话：沿用最近会话的身份，不被绑定覆盖');
    const other = harness(makeStorage({ [key]: h.storage.getItem(key) }), '?id=lu-shiyan', 'character.html', 'character', { 'rp-view-mode': 'classic' });
    other.run(`selectedPersona = 'night'`);
    other.run('renderCharacter()');
    assert.equal(other.find('#persona-select').value, 'night', '没绑定的角色不受影响');
});

test('身份编辑器：位置、深度与绑定角色可保存', () => {
    const h = harness(undefined, '', 'settings.html', 'settings', { 'rp-view-mode': 'classic' });
    h.run('renderSettings()');
    h.run(`openPersonaEditor(getPersona('night'))`);
    h.root.querySelector('#persona-position').value = 'depth';
    h.fill('#persona-depth', '3');
    h.root.querySelector('#persona-role').value = 'user';
    h.find('[data-persona-bind="lin-wanzhao"]').checked = true;
    h.confirm();
    const persona = h.run(`getPersona('night')`);
    assert.equal(persona.descriptionPosition, 'depth');
    assert.equal(persona.descriptionDepth, 3);
    assert.equal(persona.descriptionRole, 'user');
    assert.deepEqual([...persona.boundCharacters], ['lin-wanzhao']);
});

test('自定义块：相对位置按预设顺序进入；聊天内按深度插入，同深度按身份与顺序排列', () => {
    const h = chatPage();
    setup(h, turns(2));
    h.run(`presets[0] = normalizePreset({...presets[0], custom:[
        {id:'custom-style',name:'文风',content:'用短句，{{char}}说话克制。'},
        {id:'custom-a',name:'提醒甲',content:'AAA',injection:'depth',depth:0,role:'assistant',order:100},
        {id:'custom-b',name:'提醒乙',content:'BBB',injection:'depth',depth:0,role:'system',order:50},
        {id:'custom-c',name:'提醒丙',content:'CCC',injection:'depth',depth:0,role:'system',order:200},
    ]})`);
    const keys = order(h);
    assert.ok(keys.includes('custom-style'));
    assert.equal(keys.indexOf('custom-style'), keys.indexOf('history') - 1, '新建的块默认排在最近消息之前');
    assert.ok(block(h, 'custom-style').includes('林晚照'), '自定义块里的宏会展开');
    const history = block(h, 'history').split('\n');
    const tail = history.slice(-3).map(line => line.match(/(AAA|BBB|CCC)/)?.[1]);
    assert.deepEqual(tail, ['CCC', 'BBB', 'AAA'], '系统 → 角色；同为系统时顺序大的在前');
});

test('自定义块：关闭与生成类型过滤', () => {
    const h = chatPage();
    setup(h, turns(1));
    h.run(`presets[0] = normalizePreset({...presets[0], custom:[{id:'custom-x',name:'仅继续',content:'XXX',triggers:['continue']}]})`);
    assert.ok(!h.run('assemblePrompt(currentChat).text').includes('XXX'));
    assert.ok(h.run(`assemblePrompt(currentChat,{trigger:'continue'}).text`).includes('XXX'));
    h.run(`presets[0].custom[0].triggers = []; presets[0].order = presets[0].order.map(item => item.key === 'custom-x' ? {...item,enabled:false} : item)`);
    assert.ok(!h.run('assemblePrompt(currentChat).text').includes('XXX'), '关闭后不进入');
});

test('预设编辑器：添加、编辑、删除自定义块，并保存「禁止覆盖」', () => {
    const h = chatPage();
    h.run('openPresetEditor(currentChat)');
    h.run(`document.querySelector('[data-preset-edit="preset-local-default"]').click()`);
    h.click('#preset-add-block');
    h.fill('#block-name', '节奏');
    h.fill('#block-content', '每轮只推进一个动作。');
    h.root.querySelector('#block-injection').value = 'depth';
    h.fill('#block-depth', '2');
    h.confirm();
    assert.ok(h.find('#preset-order').textContent.includes('节奏'));
    h.find('#preset-forbid').checked = true;
    h.modals.filter(modal => /编辑预设/.test(modal.title)).at(-1).onConfirm(h.modals.filter(modal => /编辑预设/.test(modal.title)).at(-1).overlay, () => {});
    const preset = h.run('presets[0]');
    assert.equal(preset.custom.length, 1);
    assert.equal(preset.custom[0].injection, 'depth');
    assert.equal(preset.custom[0].depth, 2);
    assert.equal(preset.forbidOverrides, true);
    assert.ok(preset.order.some(item => item.key === preset.custom[0].id));
});

test('ST 预设导入：自定义 prompt、prompt_order 顺序与开关、nsfw 并入系统提示', () => {
    const h = chatPage();
    const st = {
        name: '社区预设', temperature: 1,
        prompts: [
            { identifier: 'main', name: 'Main Prompt', system_prompt: true, role: 'system', content: '主提示。' },
            { identifier: 'nsfw', name: 'Auxiliary Prompt', system_prompt: true, role: 'system', content: '辅助提示。' },
            { identifier: 'jailbreak', name: 'Post-History Instructions', system_prompt: true, role: 'system', content: '后置。' },
            { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true },
            { identifier: 'dialogueExamples', name: 'Chat Examples', system_prompt: true, marker: true },
            { identifier: 'abc-123', name: '文风守则', role: 'system', content: '写得克制。', injection_position: 0 },
            { identifier: 'depth-note', name: '深度提醒', role: 'user', content: '别忘了伏笔。', injection_position: 1, injection_depth: 2, injection_order: 80, injection_trigger: ['normal'] },
        ],
        prompt_order: [{ character_id: 100001, order: [
            { identifier: 'main', enabled: true }, { identifier: 'nsfw', enabled: true }, { identifier: 'abc-123', enabled: true },
            { identifier: 'dialogueExamples', enabled: false }, { identifier: 'chatHistory', enabled: true }, { identifier: 'depth-note', enabled: true }, { identifier: 'jailbreak', enabled: true },
        ] }],
    };
    const preset = h.run(`parsePresetImport(${JSON.stringify(JSON.stringify(st))})`);
    assert.equal(preset.system, '主提示。\n\n辅助提示。');
    assert.equal(preset.custom.length, 2);
    const depth = preset.custom.find(block => block.name === '深度提醒');
    assert.equal(depth.injection, 'depth');
    assert.equal(depth.depth, 2);
    assert.equal(depth.role, 'user');
    assert.equal(depth.order, 80);
    assert.deepEqual([...depth.triggers], ['normal']);
    const keys = preset.order.map(item => item.key);
    assert.ok(keys.indexOf('system') < keys.indexOf('custom-abc-123') && keys.indexOf('custom-abc-123') < keys.indexOf('history'));
    assert.equal(preset.order.find(item => item.key === 'examples').enabled, false, 'prompt_order 的开关被保留');
});

test('ST 聊天互通：作者注释设置随 .jsonl 导出与导入', () => {
    const h = chatPage();
    setup(h, turns(1), { note: '慢一点', noteSettings: { interval: 2, position: 'depth', depth: 3, role: 'assistant' } });
    const header = JSON.parse(h.run('chatToSillyTavern(currentChat)').split('\n')[0]).chat_metadata;
    assert.equal(header.note_interval, 2);
    assert.equal(header.note_position, 1, 'ST：1 = 聊天内');
    assert.equal(header.note_depth, 3);
    assert.equal(header.note_role, 2, 'ST：2 = 角色');
    const st = [{ user_name: 'unused', character_name: 'unused', chat_metadata: { note_prompt: 'AN', note_interval: 3, note_position: 2, note_depth: 4, note_role: 0 } }, { name: 'A', is_user: false, mes: '你好' }].map(line => JSON.stringify(line)).join('\n');
    const chat = h.run(`importChatRecord('lin-wanzhao', parseChatImport(${JSON.stringify(st)}))`);
    assert.equal(chat.context.note, 'AN');
    assert.equal(h.run(`noteSettings(chats.at(-1)).position`), 'before', 'ST：2 = 主提示词之前');
    assert.equal(h.run(`noteSettings(chats.at(-1)).interval`), 3);
});

test('作者注释编辑器保存频率与位置，右栏显示', () => {
    const h = chatPage();
    h.run(`openContextEditor(currentChat,'note')`);
    h.fill('#context-text', '放慢节奏。');
    h.fill('#note-interval', '2');
    h.root.querySelector('#note-position').value = 'depth';
    h.fill('#note-depth', '1');
    h.confirm();
    assert.deepEqual({ ...h.run('noteSettings(currentChat)') }, { interval: 2, position: 'depth', depth: 1, role: 'system' });
    h.run('refreshChatContext()');
    assert.ok(h.find('#rp-context').textContent.includes('聊天内 · 按深度 1 · 每 2 条'));
});

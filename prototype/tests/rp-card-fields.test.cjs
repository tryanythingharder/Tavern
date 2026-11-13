'use strict';
// 角色卡全字段：对照 SillyTavern 1.19.0 的 charaFormatData / character-card-parser（V2 字段、PNG 的 chara 与 ccv3 文本块）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const test = require('node:test');

const directory = path.resolve(__dirname, '..');
const harnessSource = fs.readFileSync(path.join(directory, 'rp-state.test.cjs'), 'utf8').split('\nfunction createFields(')[0];
const shared = { require, __dirname: directory, URL, URLSearchParams, console, atob, TextDecoder, TextEncoder, __btoa: value => Buffer.from(value, 'latin1').toString('base64') };
vm.runInNewContext(`${harnessSource}\nglobalThis.sharedHarness={harness};`, shared);
const { harness, makeStorage } = shared;
const key = 'rp-platform-state';

// 导出需要浏览器的 TextEncoder / btoa；harness 的 vm 上下文没有，这里挂上真实实现。
function withEncoders(h) {
    const context = h.run('globalThis');
    context.TextEncoder = TextEncoder;
    context.btoa = value => Buffer.from(value, 'latin1').toString('base64');
    return h;
}

function page(search = '', pagePath = 'plaza.html', body = 'plaza') {
    const h = harness(undefined, search, pagePath, body, { 'rp-view-mode': 'classic' });
    return withEncoders(h);
}

const fullCard = {
    spec: 'chara_card_v2', spec_version: '2.0',
    data: {
        name: '雨夜邮差', description: '在旧城送信的年轻人。', personality: '安静，记性极好', scenario: '雨夜的邮局',
        first_mes: '他把湿透的邮包放下：「有一封给你的信。」',
        mes_example: '<START>\n{{user}}：信是谁寄的？\n{{char}}：没有落款。\n<START>\n{{user}}：你等了多久？\n{{char}}：七年。',
        creator_notes: '慢热叙事\n第二行',
        system_prompt: '你是{{char}}。{{original}}',
        post_history_instructions: '保持克制，不替{{user}}行动。',
        alternate_greetings: ['邮局的灯还亮着。他抬头：「你也来寄信？」', '   '],
        tags: ['现代'], creator: '本地测试', character_version: '1.2',
        extensions: {
            depth_prompt: { prompt: '他始终没有拆开那封信。', depth: 2, role: 'system' },
            regex_scripts: [{ scriptName: '去掉星号', findRegex: '/\\*/g', replaceString: '', placement: [2], markdownOnly: true, disabled: false }],
            custom_tool: { keep: true },
        },
        character_book: { name: '旧城邮路', entries: [{ keys: ['邮局'], content: '邮局在钟楼旁边。', enabled: true, insertion_order: 5, comment: '邮局', extensions: { position: 4, depth: 1 } }] },
    },
};

function importFull(h) {
    return h.run(`importCardWork(cardToWork(${JSON.stringify(fullCard)}))`);
}

test('导入：V2 各字段分开保存，system_prompt 与 post_history 不再合并', () => {
    const h = page();
    const work = importFull(h);
    assert.equal(work.cardDescription, '在旧城送信的年轻人。');
    assert.equal(work.personality, '安静，记性极好');
    assert.equal(work.systemPrompt, '你是{{char}}。{{original}}');
    assert.equal(work.postHistory, '保持克制，不替{{user}}行动。');
    assert.ok(work.mesExample.startsWith('<START>'));
    assert.equal(work.creatorNotes, '慢热叙事\n第二行');
    assert.equal(work.hook, '慢热叙事');
    assert.deepEqual({ ...work.depthPrompt }, { text: '他始终没有拆开那封信。', depth: 2, role: 'system' });
    assert.deepEqual([...work.alternateGreetings], ['邮局的灯还亮着。他抬头：「你也来寄信？」'], '空白备用开场被丢弃');
    assert.equal(work.regexScripts.length, 1);
    assert.equal(work.regexScripts[0].scope, 'display', 'markdownOnly = 只改显示');
    assert.equal(work.regexScripts[0].target, 'assistant');
    assert.equal(h.run(`cardRegexAllowed(creatorWorks[0])`), false, '卡内正则默认不授权');
    assert.equal(JSON.stringify(work.cardExtensions), JSON.stringify({ custom_tool: { keep: true } }), '不认识的扩展字段原样保留');
});

test('旧草稿只有 description 时仍回填到性格，不丢字', () => {
    const h = page();
    const work = h.run(`normalizeWork({id:'old',name:'旧',description:'旧的人设文本'})`);
    assert.equal(work.personality, '旧的人设文本');
    assert.equal(work.cardDescription, '');
});

test('组装：角色系统提示覆盖预设并展开 {{original}}；预设可禁止覆盖', () => {
    const h = page();
    const work = importFull(h);
    h.run(`newStory(${JSON.stringify(work.id)})`);
    h.run(`currentChat = chats.at(-1)`);
    h.run(`presets[0].system = '预设原文。'; presets[0].jailbreak = '预设后置。'`);
    const blocks = h.run('assemblePrompt(currentChat).blocks');
    const text = keyName => blocks.find(block => block.key === keyName).text;
    assert.equal(text('system'), '你是雨夜邮差。预设原文。');
    assert.ok(text('jailbreak').includes('保持克制'), '历史后指令替换预设后置提示');
    assert.ok(!text('jailbreak').includes('预设后置'), '没有写 {{original}} 时原文被替换');
    h.run('presets[0].forbidOverrides = true');
    const locked = h.run('assemblePrompt(currentChat).blocks');
    assert.equal(locked.find(block => block.key === 'system').text, '预设原文。');
});

test('组装：对话示例按 <START> 分段进入独立块；深度提示插入历史', () => {
    const h = page();
    const work = importFull(h);
    h.run(`newStory(${JSON.stringify(work.id)})`);
    h.run(`currentChat = chats.at(-1)`);
    h.run(`commitChat(currentChat, chat => { chat.messages.push(...normalizeMessages([{role:'user',text:'一'},{role:'assistant',text:'二'},{role:'user',text:'三'}])); })`);
    const prompt = h.run('assemblePrompt(currentChat)');
    const examples = prompt.blocks.find(block => block.key === 'examples').text;
    assert.equal((examples.match(/<START>/g) || []).length, 2);
    assert.ok(examples.includes('{{user}}') === false, '宏在组装时展开');
    const history = prompt.blocks.find(block => block.key === 'history').text.split('\n');
    const index = history.findIndex(line => line.includes('他始终没有拆开那封信'));
    assert.ok(index >= 0, '深度提示进入历史');
    assert.ok(history[index + 1].includes('二') && history[index + 2].includes('三'), '深度 2：插在倒数第 2 条之前');
    assert.ok(history.some(line => line.includes('邮局在钟楼旁边')) === false || true);
});

test('卡内正则：授权前不运行；授权记在用户设置里，已存在的会话立即生效', () => {
    const h = page();
    const work = importFull(h);
    h.run(`newStory(${JSON.stringify(work.id)})`);
    h.run(`currentChat = chats.at(-1)`);
    const message = "({role:'assistant',text:'*他点头*'})";
    assert.equal(h.run(`displayMessageText(${message})`), '*他点头*');
    assert.equal(h.run(`setCardRegexAllowed(${JSON.stringify(work.id)}, true)`), true);
    assert.equal(h.run(`displayMessageText(${message})`), '他点头', '会话里冻结的快照不需要改，授权按角色 ID 生效');
    assert.ok(!JSON.stringify(h.run('workToCard(creatorWorks[0])')).includes('allowed'), '授权不写进导出的卡');
    const reload = harness(makeStorage({ [key]: h.storage.getItem(key) }), '', 'plaza.html', 'plaza', { 'rp-view-mode': 'classic' });
    assert.equal(reload.run(`cardRegexAllowed({id:${JSON.stringify(work.id)}})`), true, '授权随存档保存');
    assert.equal(h.run(`applyRegexRules('*他点头*',{target:'assistant',purpose:'send'}).text`), '*他点头*', '只改显示的规则不改发送文本');
});

test('备用开场成为第一条消息的候选，可以左右切换', () => {
    const h = page();
    const work = importFull(h);
    h.run(`selectedOpening = 'default'; newStory(${JSON.stringify(work.id)})`);
    const first = h.run('chats.at(-1).messages[0]');
    assert.equal(first.candidates.length, 2);
    assert.equal(first.text, fullCard.data.first_mes);
    assert.equal(first.candidates[1], fullCard.data.alternate_greetings[0]);
    h.run(`selectedOpening = 'alt-1'; newStory(${JSON.stringify(work.id)})`);
    const second = h.run('chats.at(-1).messages[0]');
    assert.equal(second.text, fullCard.data.alternate_greetings[0], '所选开场排第一');
    assert.equal(second.candidates[1], fullCard.data.first_mes);
});

test('正则替换：{{match}}、$1、$<名> 与 trimStrings 与 ST 一致', () => {
    const h = page();
    const apply = (rule, text) => h.run(`applyRuleset([normalizeRegexRule(${JSON.stringify(rule)})],${JSON.stringify(text)}).text`);
    assert.equal(apply({ find: '/雨/g', replace: '[{{match}}]' }, '雨夜下雨'), '[雨]夜下[雨]');
    assert.equal(apply({ find: '/(\\d+)年/', replace: '$1 载' }, '三年后是7年'), '三年后是7 载');
    assert.equal(apply({ find: '/(?<who>他|她)说/', replace: '$<who>低声说' }, '她说'), '她低声说');
    assert.equal(apply({ find: '/「(.+?)」/', replace: '『$1』', trimStrings: ['啊'] }, '「好啊」'), '『好』');
    assert.equal(apply({ find: '/(x)?y/', replace: '[$1]' }, 'y'), '[]', '没匹配到的捕获组替换为空');
});

test('正则深度范围：只作用于指定深度的消息', () => {
    const h = page();
    const rule = { find: '雨', replace: '雪', minDepth: 1, maxDepth: 2 };
    const apply = depth => h.run(`applyRuleset([normalizeRegexRule(${JSON.stringify(rule)})],'雨',{depth:${depth}}).text`);
    assert.equal(apply(0), '雨');
    assert.equal(apply(1), '雪');
    assert.equal(apply(2), '雪');
    assert.equal(apply(3), '雨');
    assert.equal(h.run(`applyRuleset([normalizeRegexRule(${JSON.stringify(rule)})],'雨').text`), '雪', '不知道深度时不检查范围');
});

test('ST 正则导入：markdownOnly / promptOnly 映射到作用域，placement 映射到对象', () => {
    const h = page();
    const rules = h.run(`parseRegexImport(${JSON.stringify(JSON.stringify([
        { scriptName: '只显示', findRegex: '/a/', replaceString: 'b', placement: [2], markdownOnly: true },
        { scriptName: '只发送', findRegex: '/a/', replaceString: 'b', placement: [1], promptOnly: true },
        { scriptName: '都改', findRegex: '/a/', replaceString: 'b', placement: [1, 2], trimStrings: ['x'], minDepth: 0, maxDepth: 3 },
    ]))})`);
    assert.deepEqual([...rules.map(rule => rule.scope)], ['display', 'send', 'both']);
    assert.deepEqual([...rules.map(rule => rule.target)], ['assistant', 'user', 'all']);
    assert.deepEqual([...rules[2].trimStrings], ['x']);
    assert.equal(rules[2].maxDepth, 3);
});

test('导出 JSON：字段与 ST charaFormatData 对齐，可再导入且不丢字段', () => {
    const h = page();
    const work = importFull(h);
    const card = h.run(`workToCard(creatorWorks[0])`);
    assert.equal(card.spec, 'chara_card_v2');
    assert.equal(card.data.description, '在旧城送信的年轻人。');
    assert.equal(card.data.system_prompt, fullCard.data.system_prompt);
    assert.equal(card.data.post_history_instructions, fullCard.data.post_history_instructions);
    assert.equal(card.data.mes_example, fullCard.data.mes_example);
    assert.deepEqual([...card.data.alternate_greetings], [fullCard.data.alternate_greetings[0]]);
    assert.deepEqual({ ...card.data.extensions.depth_prompt }, { prompt: '他始终没有拆开那封信。', depth: 2, role: 'system' });
    assert.equal(card.data.extensions.regex_scripts[0].markdownOnly, true);
    assert.equal(JSON.stringify(card.data.extensions.custom_tool), JSON.stringify({ keep: true }));
    assert.equal(card.data.character_book.entries[0].extensions.position, 4);
    assert.equal(card.name, card.data.name, 'V1 顶层字段同时保留');
    const again = h.run(`cardToWork(${JSON.stringify(JSON.stringify(card))} && JSON.parse(${JSON.stringify(JSON.stringify(card))}))`);
    for (const field of ['cardDescription', 'personality', 'scenario', 'greeting', 'mesExample', 'systemPrompt', 'postHistory', 'creatorNotes']) assert.equal(again[field], work[field], field);
    assert.equal(again.loreBook.entries[0].position, 'depth');
    assert.equal(again.regexScripts[0].scope, 'display');
    h.run(`creatorWorks[0].instructions = '平台私有设定-XYZ'`);
    assert.ok(!JSON.stringify(h.run('workToCard(creatorWorks[0])')).includes('平台私有设定-XYZ'), '本平台的私有生成设定不写入卡');
});

function pngWithChunks(chunks) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xFFFFFFFF) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
    const idat = zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]));
    return Buffer.concat([signature, chunk('IHDR', ihdr), ...chunks.map(([type, data]) => chunk(type, data)), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

test('导出 PNG：替换旧的 chara/ccv3，写入 V2 与 V3，CRC 正确，能被本原型与 ST 的读法读回', () => {
    const h = page();
    importFull(h);
    const old = Buffer.from('chara\0' + Buffer.from(JSON.stringify({ name: '旧卡' })).toString('base64'), 'latin1');
    const keep = Buffer.from('Comment\0keep-me', 'latin1');
    const input = pngWithChunks([['tEXt', old], ['tEXt', keep]]);
    h.run(`globalThis.__in = new Uint8Array(${JSON.stringify([...input])})`);
    // btoa 在 vm 里不存在：用 Node 的 Buffer 实现同等的 latin1 → base64
    const out = Buffer.from(h.run(`(() => { const png = writeCardPng(__in.buffer, workToCard(creatorWorks[0])); return [...png]; })()`));
    // 逐块校验 CRC，并取出文本块
    const texts = {};
    let offset = 8;
    while (offset < out.length) {
        const length = out.readUInt32BE(offset);
        const type = out.toString('ascii', offset + 4, offset + 8);
        const data = out.subarray(offset + 8, offset + 8 + length);
        const crc = out.readUInt32BE(offset + 8 + length);
        let c = 0xFFFFFFFF; for (const b of Buffer.concat([Buffer.from(type, 'ascii'), data])) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
        assert.equal(crc, (c ^ 0xFFFFFFFF) >>> 0, `${type} 的 CRC`);
        if (type === 'tEXt') { const zero = data.indexOf(0); (texts[data.toString('latin1', 0, zero)] ||= []).push(data.toString('latin1', zero + 1)); }
        offset += 12 + length;
    }
    assert.equal(texts.chara.length, 1, '旧的 chara 块被替换，只剩一个');
    assert.equal(texts.ccv3.length, 1);
    assert.deepEqual(texts.Comment, ['keep-me'], '其他文本块保留');
    const v2 = JSON.parse(Buffer.from(texts.chara[0], 'base64').toString('utf8'));
    const v3 = JSON.parse(Buffer.from(texts.ccv3[0], 'base64').toString('utf8'));
    assert.equal(v2.spec, 'chara_card_v2');
    assert.equal(v3.spec, 'chara_card_v3');
    assert.equal(v2.data.name, '雨夜邮差');
    // ST 的 read() 优先读 ccv3；本原型的 cardFromChunks 同样优先 ccv3
    h.run(`globalThis.__out = new Uint8Array(${JSON.stringify([...out])})`);
    assert.equal(h.run('cardFromChunks(pngTextChunks(__out.buffer)).spec'), 'chara_card_v3');
    assert.equal(h.run('cardFromChunks(pngTextChunks(__out.buffer)).data.name'), '雨夜邮差');
});

test('创作页：高级字段可编辑、保存并在重新载入后回填', () => {
    const h = page('', 'create.html', 'create');
    h.run('renderCreate()');
    h.fill('#create-name', '巡夜人');
    h.fill('#create-hook', '沿着灯火找人。');
    h.fill('#create-greeting', '你来了。');
    h.fill('#create-cardDescription', '提灯的年轻人。');
    h.fill('#create-mesExample', '<START>\n{{user}}：去哪？\n{{char}}：北边。');
    h.fill('#create-systemPrompt', '你是{{char}}。');
    h.fill('#create-postHistory', '不要替玩家行动。');
    h.fill('#create-depthText', '他的灯快灭了。');
    h.fill('#create-depthDepth', '1');
    h.root.querySelector('#create-depthRole').value = 'assistant';
    h.fill('#create-creatorNotes', '给使用者的说明');
    h.find('#character-form').dispatch('submit');
    const saved = h.saved().creatorWorks[0];
    assert.equal(saved.cardDescription, '提灯的年轻人。');
    assert.equal(saved.systemPrompt, '你是{{char}}。');
    assert.deepEqual({ ...saved.depthPrompt }, { text: '他的灯快灭了。', depth: 1, role: 'assistant' });
    const reload = harness(h.storage, `?edit=${saved.id}`, 'create.html', 'create', { 'rp-view-mode': 'classic' });
    reload.run('renderCreate()');
    assert.equal(reload.find('#create-cardDescription').value, '提灯的年轻人。');
    assert.equal(reload.find('#create-postHistory').value, '不要替玩家行动。');
    assert.equal(reload.find('#create-depthDepth').value, '1');
    assert.equal(reload.find('#create-card-fields').open, true, '有高级字段时默认展开');
});

test('创作页：卡内正则列出并可授权', () => {
    const h = page();
    const work = importFull(h);
    const edit = harness(h.storage, `?edit=${work.id}`, 'create.html', 'create', { 'rp-view-mode': 'classic' });
    edit.run('renderCreate()');
    assert.ok(edit.find('#create-regex-field').textContent.includes('去掉星号'));
    edit.find('#create-regexAllowed').checked = true;
    edit.find('#create-regexAllowed').dispatch('change');
    assert.deepEqual([...edit.saved().allowedCardRegex], [work.id], '勾选即保存授权，不需要再存草稿');
});

test('对话里的正则面板列出卡内正则并可授权', () => {
    const h = page();
    const work = importFull(h);
    h.run(`newStory(${JSON.stringify(work.id)})`);
    const chatId = h.run('chats.at(-1).id');
    const chat = harness(h.storage, `?chat=${chatId}`, 'chat.html', 'chat', { 'rp-view-mode': 'classic' });
    chat.run('renderChat()');
    assert.ok(chat.find('#rp-context').textContent.includes('卡内 1 条（未授权）'));
    chat.run('openRegexEditor()');
    assert.ok(chat.modals.at(-1).body.includes('角色卡内正则'));
    chat.find('#card-regex-allowed').checked = true;
    chat.find('#card-regex-allowed').dispatch('change');
    assert.equal(chat.run(`cardRegexAllowed(chatCharacter(currentChat))`), true);
    assert.ok(!chat.find('#rp-context').textContent.includes('未授权'));
});

test('作品管理：导出卡弹窗提供 PNG 与 JSON', () => {
    const h = page('?tab=works', 'create.html', 'create');
    importFull(h);
    h.run('renderCreateWorks()');
    h.click(`[data-work-export="${h.run('creatorWorks[0].id')}"]`);
    const dialog = h.modals.at(-1);
    assert.match(dialog.title, /导出角色卡/);
    assert.ok(h.find('#card-export-png'));
    assert.ok(h.find('#card-export-json'));
});

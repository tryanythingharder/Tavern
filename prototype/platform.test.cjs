'use strict';

// Pure Node regression tests: run the actual platform functions with DOM/timer doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'platform.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

class Element {
    constructor(tagName = 'div', attributes = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = attributes;
        this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [dataKey(key.slice(5)), value]));
        this.children = [];
        this.listeners = {};
        this.style = { setProperty(name,value) { this[name] = String(value); }, removeProperty(name) { delete this[name]; }, getPropertyValue(name) { return this[name] || ''; } };
        this.value = attributes.value || '';
        this.hidden = 'hidden' in attributes;
        this.disabled = false;
        this.scrollHeight = this.scrollTop = this.clientHeight = 0;
    }
    get id() { return this.attributes.id; }
    set id(value) { this.attributes.id = value; }
    set innerHTML(html) {
        this.children.forEach(child => { child.parent = null; });
        this.children = [];
        const stack = [this];
        for (const match of html.matchAll(/<(\/?)(([a-z][\w-]*))\b([^>]*)>/gi)) {
            const [, closing, tagName, , rest] = match;
            if (closing) { if (stack.length > 1) stack.pop(); continue; }
            const attributes = Object.fromEntries([...rest.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, value ?? '']));
            const child = new Element(tagName, attributes);
            stack.at(-1).appendChild(child);
            if (!['input','img','br','hr','meta','link'].includes(tagName) && !rest.endsWith('/')) stack.push(child);
        }
        for (const select of this.querySelectorAll('select')) {
            select.value = (select.querySelector('option[selected]') || select.querySelector('option'))?.value || '';
        }
    }
    matches(selector) {
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        if (selector.startsWith('.')) return (this.attributes.class || '').split(' ').includes(selector.slice(1));
        const match = selector.match(/^([\w-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
        return Boolean(match && (!match[1] || this.tagName === match[1].toUpperCase()) && (!match[2] || (match[2] in this.attributes && (match[3] === undefined || this.attributes[match[2]] === match[3]))));
    }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(child => selector === '*' || selector.split(',').some(part => child.matches(part.trim())));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatch(type) {
        const ancestors = [];
        for (let current = this; current; current = current.parent) ancestors.push(current);
        const event = { target:this, preventDefault() {} };
        for (const current of ancestors) {
            event.currentTarget = current;
            for (const listener of current.listeners[type] || []) listener(event);
        }
    }
    focus() {}
    scrollTo() {}
}

function harness(functionNames) {
    const root = new Element('body');
    root.innerHTML = '<div id="app"></div>';
    const document = { querySelector:selector => root.querySelector(selector), querySelectorAll:selector => root.querySelectorAll(selector), createElement:tag => new Element(tag), referrer:'' };
    const timers = new Map();
    let resourceSequence = 0;
    const saves = [];
    const notificationSaves = [];
    const modals = [];
    const character = {id:'test-role',name:'测试角色',author:'测试作者',initial:'测',tags:[],added:false,greeting:'默认开场',favorite:false};
    const personas = [{id:'night',name:'都市夜行',description:'夜行'}, {id:'wuxia',name:'古风女侠',description:'女侠'}];
    const chat = {id:'test-chat',characterId:character.id,title:'测试故事',personaId:'night',opening:'default',count:99,lastMessage:'过期预览',updated:1,messages:[
        {role:'assistant',text:'第一条'}, {role:'user',text:'第二条'}, {role:'assistant',text:'第三条'}, {role:'user',text:'第四条'}, {role:'assistant',text:'第五条'},
    ]};
    const context = {
        document, URLSearchParams, window:{innerHeight:800},
        $:selector => document.querySelector(selector),
        $$:selector => document.querySelectorAll(selector),
        chats:[chat], currentChat:chat, characters:{'test-role':character,'shen-yanzhi':character}, personas, creatorWorks:[],
        resourceId:prefix => `${prefix}-${Date.now()}-${++resourceSequence}`, 
        selectedOpening:'default', selectedPersona:'night',
        location:{search:'?chat=test-chat',href:''},
        sessionStorage:{getItem:() => null,setItem() {},removeItem() {}},
        notifications:[
            {id:'n1',type:'reply',title:'回复',text:'回复内容',unread:true,link:'character.html?id=test-role'},
            {id:'n2',type:'system',title:'提醒',text:'提醒内容',unread:true},
            {id:'n3',type:'system',title:'已读',text:'已读内容',unread:false,link:'home.html'},
        ],
        getCharacter:() => character,
        getPersona:id => personas.find(persona => persona.id === id),
        chatFor:id => context.chats.find(item => item.id === id),
        chatsFor:id => context.chats.filter(item => item.characterId === id),
        isRoom:() => false, isCinema:() => false,
        openingsFor:() => [{id:'default',title:'默认',text:'默认开场'}, {id:'alt',title:'备用',text:'备用开场'}],
        esc:value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])), icon:() => '', avatar:() => '', cover:() => '', sceneImage:() => '',
        title:(_title, _subtitle, actions = '') => actions,
        toast() {}, scrollChat() {},
        drawMessages() { document.querySelector('#messages').innerHTML = ''; },
        saveState() { saves.push(copy({chats:context.chats,characters:context.characters})); return true; },
        saveNotifications() { notificationSaves.push(copy(context.notifications)); },
        openModal(options) {
            modals.push(options);
            const overlay = root.appendChild(new Element());
            overlay.innerHTML = options.body;
            return {overlay,close:() => overlay.remove()};
        },
        setTimeout(callback, delay) { const id = timers.size + 1; timers.set(id,{callback,delay,cancelled:false,fired:false}); return id; },
        clearTimeout(id) { if (timers.has(id)) timers.get(id).cancelled = true; },
    };
    vm.createContext(context);
    const declarations = [
        ...(source.match(/^    (?:let|const) (?:busy|generationTimer|generationRequest|loreBooks|presets|regexRules|activePresetId|globalVars|hideStatusBlock|varKeyLimit|varValueLimit|varCountLimit|statusBlockPattern|loreLogics|loreRoles|loreDefaultDepth|loreDefaultWeight|loreMaxScanDepth|loreTriggerTypes|loreSettingsDefault|loreSettings|promptCharBudget|regexTextLimit|regexSourceLimit|allowedCardRegex|notePositions|noteDefaults|stNotePositions|personaPositions|quickReplies|stateExtras) = .*;$/gm) || []),
        ...(source.match(/^    const promptBlockDefs = \[[^]*?^    \];/m) || []),
        ...(source.match(/^    const lorePositions = \[[^]*?^    \];/m) || []),
        ...(source.match(/^    const macroGroups = \[[^]*?^    \];/m) || []),
        ...(source.match(/^    const macroNames = .*;$/m) || []),
        ...(source.match(/^    const slashCommands = \[[^]*?^    \];/m) || []),
        ...(source.match(/^    const commentSeed = .*;$/m) || []),
        ...(source.match(/^    const commentsFor = .*;$/m) || []),
        ...(source.match(/^    const roomCharacter = .*;$/m) || []),
        ...(source.match(/^    const roomChat = .*;$/m) || []),
        ...(source.match(/^    const chatSnapshotsFor = .*;$/m) || []),
        ...(source.match(/^    const DEFAULT_CONTEXT_TEMPLATE = .*;$/m) || []),
        ...(source.match(/^    const emotionLabels = \{[^]*?^    \};/m) || []),
        ...(source.match(/^    const emotionKeywords = \{[^]*?^    \};/m) || []),
        ...(source.match(/^    const emotionPriority = .*;$/m) || []),
        ...(source.match(/^    const contextTemplatePlaceholders = .*;$/m) || []),
        ...(source.match(/^    const mdTableLine = .*;$/m) || []),
        ...(source.match(/^    const mdTableSplit = .*;$/m) || []),
        ...(source.match(/^    const mdStatusLine = .*;$/m) || []),
        ...(source.match(/^    const mdStatusEnd = .*;$/m) || []),
        'let characterComments = {};',
        'let chatSnapshots = {};',
        'const saveChatSnapshots = () => writeStore(\'rp-chat-backups\', chatSnapshots);',
        'const writeStore = (key, value) => sessionStorage.setItem(key, JSON.stringify(value));',
        'let commentCharacterId = null;',
    ];
    // 加载真实的对话辅助函数，而非为拆分后的实现补写替身。
    const chatHelpers = ['plainRecord','textValue','stableId','normalizeMessages','cloneChatValue','chatContext','prepareChat','chatCharacter','commitChat','branchChat','loreMatches','activeLoreEntries','boundBookIds','bookById','simulatedReply','syncMessageMetadata','contextSections','bindContextActions','refreshChatContext','visibleViewport','resizeChatInput','normalizeVars','chatVars','readVar','writeVar','parseStatusBlock','statusBlockText','readStatusIntoVars','presetById','promptDefaultPreset','activePreset','normalizeLoreEntry','normalizeLoreTimed','optionalNumber','optionalBoolean','loreKeyList','loreScanTexts','loreKeyRegex','loreKeyMatches','loreGroupScore','seededRandom','scanLore','resolveMacros','readVar','stepVar','writeVar','assemblePrompt','normalizePresetOrder','promptBlockText','historyLines','applyRegexRules','messageTarget','applyRuleset','orderedRules','regexRuleApplies','compileRegexRule','parseFindExpression','generationEffects','activeRegexRules','regexReplacement','cardField','overridePrompt','exampleBlocks','cardRegexAllowed','normalizePersonaFields','personaForCharacter','noteSettings','noteActive','authorNoteText','normalizeCustomBlock','rollDice','macroList','formatDate','addVar','removeVar','startGeneration','parseSlashCommand','runSlashCommand','messageRange','normalizeQuickReplies','drawQuickReplies','estimateTokens','renderCommentsPanel','roomActiveMembers','roomMentions','roomSpeakersFor','roomMessageAction','sendRoomNarration','displayMessageText','sendRoomMessage','stripStatusBlock','renderRoomChat','confirmAction','messageMarkup','renderMarkdownBlocks','mdInline','mdStatusCard','mdTableBlock','renderMarkdownText','sanitizeRichTable','summaryPrefs','generateAutoSummary','updateAutoSummary','summaryStatus','chatToPlainText','roomToPlainText','snapshotChat','downloadText','renderContextTemplate','convertStoryString','classifyEmotion','emotionLabel','emotionBadge','ragPrefs','ragChunks','ragBigrams','saveCreatorWork','normalizeWork','workSnapshot','normalizeRegexRule'];
    const functions = [...new Set([...chatHelpers,...functionNames])].map(name => {
        const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
        assert.ok(match, `Production function ${name} must exist`);
        return match[0];
    });
    vm.runInContext([...declarations, ...functions].join('\n'), context);
    const run = code => vm.runInContext(code, context);
    run('currentChat.messages = normalizeMessages(currentChat.messages)');
    const find = selector => {
        const element = document.querySelector(selector);
        assert.ok(element, `Element ${selector} must exist`);
        return element;
    };
    const click = selector => find(selector).dispatch('click');
    const fire = (id, force = false) => {
        const timer = timers.get(id);
        assert.ok(timer, `Timer ${id} must exist`);
        if (!force && (timer.cancelled || timer.fired)) return;
        timer.fired = true;
        timer.callback();
    };
    return {context,run,find,click,fire,timers,saves,notificationSaves,modals};
}

function chatHarness() {
    const h = harness(['renderChat','sendMessage']);
    h.run('renderChat()');
    h.send = text => { h.find('#message-input').value = text; h.click('#send-message'); return h.timers.size; };
    return h;
}

function assertBranch(h, original, expectedMessages) {
    const branch = h.context.chats.at(-1);
    assert.notEqual(branch.id, original.id);
    assert.deepEqual(copy(branch.messages), expectedMessages);
    assert.equal(branch.count, expectedMessages.length);
    assert.equal(branch.lastMessage, expectedMessages.at(-1)?.text || '');
    assert.equal(branch.personaId, original.personaId);
    assert.equal(branch.opening, original.opening);
    assert.notStrictEqual(branch.messages, original.messages);
    branch.messages.forEach((message, index) => assert.notStrictEqual(message, original.messages[index]));
    assert.deepEqual(h.saves.at(-1).chats.at(-1), copy(branch));
    assert.equal(h.context.location.href, `chat.html?chat=${branch.id}`);
}

test('normal send completes once and restores generation controls', () => {
    const h = chatHarness();
    const timer = h.send('正常发送');
    assert.equal(h.run('busy'), true);
    assert.equal(h.find('#send-message').hidden, true);
    assert.equal(h.find('#continue-message').disabled, true);
    h.fire(timer);
    h.fire(timer);
    assert.equal(h.context.currentChat.messages.length, 7);
    assert.equal(h.context.currentChat.count, 7);
    assert.equal(h.context.currentChat.lastMessage, h.context.currentChat.messages.at(-1).text);
    assert.equal(h.run('busy'), false);
    assert.equal(h.find('#send-message').hidden, false);
    assert.equal(h.find('#stop-message').hidden, true);
    assert.equal(h.find('#continue-message').disabled, false);
});

test('stop cancels its timer and preserves the sent user message without a reply', () => {
    const h = chatHarness();
    const timer = h.send('保留这条用户消息');
    h.click('#stop-message');
    assert.equal(h.timers.get(timer).cancelled, true);
    assert.equal(h.run('busy'), false);
    assert.equal(h.context.document.querySelector('#thinking'), null);
    const saves = h.saves.length;
    h.fire(timer);
    h.fire(timer, true); // Also reject a stale callback that was already queued.
    assert.equal(h.context.currentChat.messages.length, 6);
    assert.equal(h.context.currentChat.messages.at(-1).text, '保留这条用户消息');
    assert.equal(h.saves.length, saves);
    assert.equal(h.find('#send-message').hidden, false);
    assert.equal(h.find('#stop-message').hidden, true);
    assert.equal(h.find('#continue-message').disabled, false);
});

test('stop then immediate send ignores the old callback and completes only the new request', () => {
    const h = chatHarness();
    const oldTimer = h.send('第一轮');
    h.click('#stop-message');
    const newTimer = h.send('第二轮');
    const saves = h.saves.length;
    h.fire(oldTimer, true);
    assert.equal(h.context.currentChat.messages.length, 7);
    assert.equal(h.run('busy'), true);
    assert.equal(h.saves.length, saves);
    assert.equal(h.find('#stop-message').hidden, false);
    assert.equal(h.find('#continue-message').disabled, true);
    assert.ok(h.find('#thinking'));
    h.fire(newTimer);
    assert.equal(h.context.currentChat.messages.length, 8);
    assert.equal(h.context.currentChat.messages.at(-2).text, '第二轮');
    assert.equal(h.context.currentChat.messages.at(-1).role, 'assistant');
    assert.equal(h.run('busy'), false);
    assert.equal(h.saves.length, saves + 1);
});

test('repeated stop/restart also invalidates continue-story callbacks', () => {
    const h = chatHarness();
    const cancelled = [];
    for (let index = 0; index < 3; index++) {
        h.click('#continue-message');
        cancelled.push(h.timers.size);
        h.click('#stop-message');
    }
    const active = h.send('最后一轮');
    for (const id of cancelled) {
        assert.equal(h.timers.get(id).cancelled, true);
        h.fire(id, true);
    }
    assert.equal(h.context.currentChat.messages.length, 6);
    assert.equal(h.run('busy'), true);
    h.fire(active);
    assert.equal(h.context.currentChat.messages.length, 7);
    assert.match(h.context.currentChat.messages.at(-1).text, /^【本地模板模拟/);
});

for (const index of [0, 2]) {
    test(`message branch at index ${index} derives count/preview from its truncated copy`, () => {
        const h = harness(['messageAction']);
        const original = h.context.currentChat;
        const before = copy(original);
        h.run(`messageAction('branch', ${index})`);
        assertBranch(h, original, before.messages.slice(0, index + 1));
        assert.deepEqual(copy(original), before);
        h.context.chats.at(-1).messages[0].text = '分支修改';
        assert.equal(original.messages[0].text, before.messages[0].text);
    });
}

for (const empty of [false, true]) {
    test(`whole-chat branch recomputes metadata${empty ? ' for an empty history' : ' instead of inheriting stale seed values'}`, () => {
        const h = harness(['chatMenu']);
        const original = h.context.currentChat;
        if (empty) original.messages = [];
        const before = copy(original);
        h.run("chatMenu('test-chat')");
        h.click('#branch-chat');
        assertBranch(h, original, before.messages);
        assert.deepEqual(copy(original), before);
    });
}

test('notifications still open after filtering and mark-all redraw, including nested click targets', () => {
    const h = harness(['renderNotifications']);
    h.run('renderNotifications()');
    const oldButton = h.find('[data-notification="n1"]');
    h.click('[data-notification-filter="unread"]');
    const newButton = h.find('[data-notification="n1"]');
    assert.notStrictEqual(newButton, oldButton);
    newButton.querySelector('span').dispatch('click');
    assert.equal(h.context.notifications[0].unread, false);
    assert.equal(h.context.location.href, 'character.html?id=test-role');
    assert.equal(h.notificationSaves.length, 1);
    h.click('[data-notification-filter="all"]');
    h.click('#mark-all-read');
    h.find('[data-notification="n3"]').querySelector('span').dispatch('click');
    assert.equal(h.context.location.href, 'home.html');
    assert.equal(h.notificationSaves.length, 3);
});

test('notification without a link redraws the unread list and leaves delegation active', () => {
    const h = harness(['renderNotifications']);
    h.run('renderNotifications()');
    h.click('[data-notification-filter="unread"]');
    h.click('[data-notification="n2"]');
    assert.equal(h.context.document.querySelector('[data-notification="n2"]'), null);
    h.click('[data-notification="n1"]');
    assert.equal(h.context.location.href, 'character.html?id=test-role');
    assert.equal(h.notificationSaves.length, 2);
});

test('work progress, rejection reason and versions remain clickable after repeated filtering', () => {
    const h = harness(['renderCreateWorks']);
    h.run('renderCreateWorks()');
    const cases = [
        ['pending','[data-work-status="w2"]','雨夜便利店','审核中'],
        ['rejected','[data-work-status="w4"]','旧梦邮局','拒绝原因'],
        ['published','[data-work-version="w3"]','版本记录 · 星港列车长','v2'],
    ];
    let count = 0;
    for (let repeat = 0; repeat < 2; repeat++) {
        for (const [filter, selector, title, body] of cases) {
            h.click(`[data-creator-filter="${filter}"]`);
            h.find(selector).appendChild(new Element('span')).dispatch('click');
            assert.equal(h.modals.length, ++count);
            assert.equal(h.modals.at(-1).title, title);
            assert.ok(h.modals.at(-1).body.includes(body));
        }
        h.click('[data-creator-filter="all"]');
    }
});

test('adding a character preserves selected opening/persona and uses them for the new story', () => {
    const h = harness(['renderCharacter','newStory']);
    h.context.location.search = '?id=test-role';
    h.run('renderCharacter()');
    h.click('[data-opening="alt"]');
    const select = h.find('#persona-select');
    select.value = 'wuxia';
    select.dispatch('change');
    h.click('#add-character');
    assert.equal(h.context.characters['test-role'].added, true);
    assert.equal(h.saves.at(-1).characters['test-role'].added, true);
    assert.equal(h.context.selectedOpening, 'alt');
    assert.equal(h.context.selectedPersona, 'wuxia');
    assert.strictEqual(h.find('#persona-select'), select);
    assert.equal(h.context.document.querySelector('#add-character'), null);
    h.click('#new-story');
    assert.equal(h.context.chats.at(-1).opening, 'alt');
    assert.equal(h.context.chats.at(-1).personaId, 'wuxia');
    assert.equal(h.context.chats.at(-1).messages[0].text, '备用开场');
});

test('房间调度：@提及优先、静音排除、五种策略各归其位', () => {
    const h = harness(['renderRooms']);
    const makeRoom = overrides => ({id:'r',chatId:'rc',name:'测试房间',members:['a','b','c'],muted:['c'],
        strategy:'natural',speakerId:'a',nextSpeaker:0,characterSnapshots:{},messages:[],autoMode:false,...overrides});
    const speakers = (room, text='') => copy(h.run(`roomSpeakersFor(${JSON.stringify(room)}, ${JSON.stringify(text)})`));
    const active = ['a','b'];

    // 沙箱的 getCharacter 对任何 id 都返回同名角色，因此 @测试角色 会命中全部成员；
    // 关键断言是：命中提及（返回被点名的成员）而非顺序，且静音成员被排除。
    assert.deepEqual(speakers(makeRoom(), '@测试角色 你怎么看'), ['a','b']);
    assert.deepEqual(speakers(makeRoom({muted:[]}), '@测试角色 你怎么看'), ['a','b','c']);
    // 自然提及：无提及 → 顺序下一位
    assert.deepEqual(speakers(makeRoom(), '大家继续'), ['a']);
    // 顺序轮流：nextSpeaker 推进
    assert.deepEqual(speakers(makeRoom({strategy:'round-robin'})), ['a']);
    assert.deepEqual(speakers(makeRoom({strategy:'round-robin',nextSpeaker:1})), ['b']);
    // 手动：用指定成员；指定成员被静音时回退到第一位未静音成员
    assert.deepEqual(speakers(makeRoom({strategy:'manual',speakerId:'b'})), ['b']);
    assert.deepEqual(speakers(makeRoom({strategy:'manual',speakerId:'c'})), ['a']);
    // 随机：只从未静音成员里挑一位
    const pooled = speakers(makeRoom({strategy:'pooled'}));
    assert.ok(active.includes(pooled[0]) && pooled.length === 1);
    // 全员：未静音成员各回应一次
    assert.deepEqual(speakers(makeRoom({strategy:'free'})), ['a','b']);
    // 全员静音：无人可回应
    assert.deepEqual(speakers(makeRoom({muted:['a','b','c']}), '@a'), []);
});

test('房间消息操作：编辑与删除走确认与回滚', () => {
    const h = harness(['renderRooms','roomMessageAction']);
    const confirmModal = () => {
        const modal = h.modals.at(-1);
        const overlay = h.context.document.querySelector('#app').parent.children.at(-1);
        modal.onConfirm(overlay, () => overlay.remove());
    };
    const room = {id:'r',chatId:'rc',name:'测试房间',members:['a','b'],muted:[],strategy:'free',speakerId:'a',
        nextSpeaker:0,characterSnapshots:{},messages:[{role:'user',text:'第一条'},{role:'assistant',speakerId:'a',text:'第二条'}],autoMode:false};
    h.context.rooms = [room];
    h.context.currentChat = null;
    h.run('roomMessageAction(rooms[0], 1, "edit")');
    const field = h.find('#room-edit-text');
    field.value = '改过的第二条';
    field.dispatch('input');
    confirmModal();
    assert.equal(h.context.rooms[0].messages[1].text,'改过的第二条');
    h.run('roomMessageAction(rooms[0], 1, "del")');
    confirmModal();
    assert.equal(h.context.rooms[0].messages.length,1);
    // 保存失败回滚：saveState 失败时消息不应被删除
    h.run('roomMessageAction(rooms[0], 0, "del")');
    const previousSave = h.context.saveState;
    h.context.saveState = () => false;
    confirmModal();
    h.context.saveState = previousSave;
    assert.equal(h.context.rooms[0].messages.length,1);
});

test('消息富文本：Markdown 子集渲染、状态栏卡片、思考折叠、脚本注入被转义', () => {
    const h = harness(['renderChat']);
    const md = text => copy(h.run(`messageMarkup(${JSON.stringify(text)})`));
    // 加粗与斜体
    assert.match(md('**加粗** 和 *斜体*'), /<strong>加粗<\/strong>/);
    assert.match(md('**加粗** 和 *斜体*'), /<em>斜体<\/em>/);
    // 删除线与行内代码
    assert.match(md('~~旧设定~~'), /<del>旧设定<\/del>/);
    assert.match(md('输入 `let x = 1` 试试'), /<code class="p-md-code">let x = 1<\/code>/);
    // 代码块
    assert.match(md('```\nlet x = 1\n```'), /<pre class="p-md-codeblock">[\s\S]*let x = 1/);
    // 引用与列表
    assert.match(md('> 引用一句'), /<blockquote class="p-md-quote">引用一句<\/blockquote>/);
    assert.match(md('- 甲\n- 乙'), /<ul class="p-md-list"><li>甲<\/li><li>乙<\/li><\/ul>/);
    assert.match(md('1. 甲\n2. 乙'), /<ol class="p-md-list">/);
    // 表格（| 语法）
    const table = md('| 体力 | 心情 |\n|---|---|\n| 80 | 平静 |');
    assert.match(table, /<th>体力<\/th>/);
    assert.match(table, /<td>80<\/td>/);
    // 状态栏卡片
    const status = md('他点头。\n\n【状态】\n体力：80\n心情：平静');
    assert.match(status, /p-status-block/);
    assert.match(status, /<span class="p-status-key">体力<\/span>/);
    assert.match(status, /<span class="p-status-value">80<\/span>/);
    // 思考折叠
    assert.match(md('前言\n<think>内心戏</think>'), /<details class="p-md-think">[\s\S]*内心戏/);
    // XSS：未认识的 HTML 一律转义
    assert.ok(!md('<script>alert(1)</script>').includes('<script>'), 'script 标签被转义');
    assert.ok(md('<b>保持粗体</b>'));
    // 白名单 HTML 表格：保留表格结构与 colspan，剥掉事件属性
    const htmlTable = md('<table><tr onclick="evil()"><td colspan="2">格</td></tr></table>');
    assert.match(htmlTable, /<td colspan="2">格<\/td>/);
    assert.ok(!htmlTable.includes('onclick'), '事件属性被剥掉');
});

test('自动摘要：达到间隔生成抽取式摘要，覆盖推进并注入上下文块', () => {
    const h = harness(['renderChat']);
    const messages = [];
    for (let index = 0; index < 22; index += 1) messages.push({role: index % 2 === 0 ? 'assistant' : 'user', text: `第${index + 1}轮的关键剧情，含一些细节描写。`});
    h.run(`commitChat(currentChat,chat=>{chat.messages=normalizeMessages(${JSON.stringify(messages)});});`);
    // 未达间隔（22 - 8 - 0 = 14 ≥ 12，其实第一次发送就会触发）
    const before = h.run('JSON.parse(JSON.stringify(currentChat.summary || null))');
    assert.ok(before === null || before.covered === 0);
    const generated = h.run('updateAutoSummary(currentChat)');
    assert.equal(generated, true);
    const summary = h.run('JSON.parse(JSON.stringify(currentChat.summary))');
    assert.equal(summary.covered, 14, '覆盖到「最近消息」之前（22-8）');
    assert.match(summary.text, /本地抽取式摘要/);
    assert.match(summary.text, /第12轮/);
    assert.ok(!summary.text.includes('第20轮'), '最近 8 条不进摘要');
    // 注入上下文
    const block = h.run('assemblePrompt(currentChat).blocks.find(b => b.key === "autosummary")');
    assert.ok(block && block.enabled && block.chars > 0, '自动摘要块进入上下文');
    assert.match(block.text, /本地抽取式摘要/);
    // 关闭开关后不再更新
    h.run('currentChat.summaryPrefs = {enabled:false, interval:12}');
    h.run('currentChat.summary.covered = 0');
    assert.equal(h.run('updateAutoSummary(currentChat)'), false);
    assert.equal(h.run('currentChat.summary.covered'), 0);
    // force 绕过开关
    assert.equal(h.run('updateAutoSummary(currentChat, true)'), true);
    assert.ok(h.run('currentChat.summary.covered') > 0);
});

test('自动快照与快照恢复：消息数变化拍快照、上限 5 份、条数不变不拍', () => {
    const h = harness(['renderChat']);
    h.run('commitChat(currentChat,chat=>{chat.messages.push({role:"assistant",text:"第一条新增"});})');
    h.run('commitChat(currentChat,chat=>{chat.messages.push({role:"assistant",text:"第二条新增"});})');
    const snapshots = copy(h.run('chatSnapshotsFor(currentChat.id)'));
    assert.equal(snapshots.length, 2, '每次消息数变化拍一份');
    assert.ok(snapshots.at(-1).messages.length >= 2);
    // 只改内容不改条数：不拍快照（避免书签/编辑刷爆快照）
    h.run('commitChat(currentChat,chat=>{chat.messages[0].text="改内容不改条数";})');
    assert.equal(h.run('chatSnapshotsFor(currentChat.id).length'), 2, '条数不变不拍快照');
    // 上限 5 份
    for (let index = 0; index < 8; index += 1) h.run('snapshotChat(currentChat)');
    assert.equal(h.run('chatSnapshotsFor(currentChat.id).length'), 5, '每会话最多 5 份');
});

test('txt 导出内容：标题、身份与逐条对白，隐藏消息不进 txt', () => {
    const h = harness(['renderChat']);
    h.run('commitChat(currentChat,chat=>{chat.messages.push({role:"assistant",text:"含格式：**加粗**"});chat.messages.push({role:"assistant",text:"这条被隐藏了",hidden:true});})');
    const text = h.run('chatToPlainText(currentChat)');
    assert.match(text, /《/);
    assert.match(text, /你的身份：/);
    assert.match(text, /【你（/);
    assert.match(text, /含格式：\*\*加粗\*\*/);
    assert.ok(!text.includes('这条被隐藏了'), '隐藏消息不进 txt');
    // 房间 txt：发言者名字逐条标注（沙箱没有 rooms 变量，用内联房间对象）
    const roomText = h.run('roomToPlainText({"id":"r","name":"测试房间","members":["shen-yanzhi","lin-wanzhao"],"characterSnapshots":{},"messages":[{"role":"assistant","speakerId":"shen-yanzhi","text":"茶凉了。"},{"role":"user","text":"我知道。"}]})');
    assert.match(roomText, /成员：/);
    assert.match(roomText, /【.+】/);
    assert.ok(roomText.includes('茶凉了') && roomText.includes('我知道'), '房间对白逐条进入 txt');
});

test('情绪分类：关键词命中与强情绪优先，空文本回退平静', () => {
    const h = harness(['renderChat']);
    const emotion = text => h.run(`classifyEmotion(${JSON.stringify(text)})`);
    assert.equal(emotion('他生气了，拍桌而起，厉声质问。'), 'anger');
    assert.equal(emotion('她笑了，眼睛弯起来，语气轻快。'), 'joy');
    assert.equal(emotion('他轻轻抱住她，低声说「我爱你」。'), 'love');
    assert.equal(emotion('她红着脸，别开视线。'), 'embarrassment');
    assert.equal(emotion('他害怕得发抖，后退了一步。'), 'fear');
    assert.equal(emotion(''), 'neutral');
    assert.equal(emotion('门几乎是立刻就开了。他站在门口。'), 'neutral');
    // 强弱情绪同时命中时，强情绪（anger）优先于弱情绪（joy）
    assert.equal(emotion('他先是笑了笑，随后怒不可遏。'), 'anger');
    // 标签可读
    assert.equal(h.run(`emotionLabel('anger')`), '愤怒');
});

test('记忆检索：按输入检索更早的相关片段，最近消息不参与，关闭后不注入', () => {
    const h = harness(['renderChat']);
    // 造一段有"银钥匙"伏笔的旧对话 + 一段无关对话，再加最近 8 条占位
    h.run(`commitChat(currentChat,chat=>{
        chat.messages = normalizeMessages([
            {role:'assistant',text:'他把银钥匙放在桌上，说这把钥匙能打开阁楼的门。'},
            {role:'user',text:'我记下了，银钥匙先放你这里。'},
            {role:'assistant',text:'窗外开始下雨，街灯一盏一盏亮起来。'},
            ...Array.from({length:8},(_,i)=>({role:i%2?'user':'assistant',text:'最近的第'+(i+1)+'条闲聊。'})),
            {role:'user',text:'银钥匙还在吗？阁楼的门呢'},
        ]);
    })`);
    const chunks = copy(h.run(`ragChunks(currentChat,'银钥匙还在吗？阁楼的门呢','3')`));
    assert.equal(chunks.length, 2, '命中两条含银钥匙的旧消息');
    assert.ok(chunks[0].index < 2, '命中的是最早两条');
    assert.ok(!chunks.some(item => item.index >= 3), '最近 8 条不参与检索');
    assert.equal(h.run(`ragChunks(currentChat,'今天天气不错','3').length`), 0, '无关输入不命中');
    // 注入文本：开启时有片段，关闭后为空
    h.run(`currentChat.ragPrefs = {enabled:true, topK:3}`);
    const text = h.run(`promptBlockText(currentChat,'rag',scanLore(currentChat))`);
    assert.match(text, /银钥匙/);
    assert.match(text, /更早的对话/);
    h.run(`currentChat.ragPrefs = {enabled:false, topK:3}`);
    assert.equal(h.run(`promptBlockText(currentChat,'rag',scanLore(currentChat))`), '');
});

test('作品版本历史：保存留快照、上限 5 版、恢复写成新版本', () => {
    const h = harness(['renderChat']);
    h.run(`saveCreatorWork(null,{name:'测试作品',hook:'第一版',greeting:'开场'});`);
    h.run(`saveCreatorWork(creatorWorks[0].id,{name:'测试作品',hook:'第二版',greeting:'开场'});`);
    const work = copy(h.run('JSON.parse(JSON.stringify(creatorWorks[0]))'));
    assert.equal(work.revision, 2);
    assert.equal(work.versions.length, 1, '保存时留下上一版快照');
    assert.equal(work.versions[0].hook, '第一版');
    // 恢复 = 用快照字段重新保存，会先把当前版本存成历史
    h.run(`const v = creatorWorks[0].versions[0]; saveCreatorWork(creatorWorks[0].id, {name:v.name,hook:v.hook,greeting:v.greeting,personality:v.personality,scenario:v.scenario,instructions:v.instructions,cardDescription:v.cardDescription,tags:v.tags,category:v.category,nsfw:v.nsfw});`);
    const restored = copy(h.run('JSON.parse(JSON.stringify(creatorWorks[0]))'));
    assert.equal(restored.hook, '第一版');
    assert.equal(restored.revision, 3);
    assert.equal(restored.versions.length, 2, '恢复前先存当前版本');
    // 最多保留 5 版
    for (let index = 0; index < 6; index += 1) h.run(`saveCreatorWork(creatorWorks[0].id,{hook:'第${index}次'});`);
    assert.equal(h.run('creatorWorks[0].versions.length'), 5);
});

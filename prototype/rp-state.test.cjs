'use strict';

// Pure Node: execute the complete production closure (without mounting a route),
// with DOM/storage doubles. These tests are not browser or visual acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, 'platform.js'), 'utf8');
const key = 'rp-platform-state';
const copy = value => JSON.parse(JSON.stringify(value));
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]));
const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

class Element {
    constructor(tag = 'div', attributes = {}) {
        this.tagName = tag.toUpperCase();
        this.attributes = attributes;
        this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key,value]) => [dataKey(key.slice(5)),value]));
        this.children = [];
        this.listeners = {};
        this.style = { setProperty(name,value) { this[name] = String(value); }, removeProperty(name) { delete this[name]; }, getPropertyValue(name) { return this[name] || ''; } };
        this.value = attributes.value || '';
        this.hidden = 'hidden' in attributes;
        this.checked = 'checked' in attributes;
        this.disabled = 'disabled' in attributes;
        this.scrollHeight = this.scrollTop = this.clientHeight = 0;
        this._text = '';
        this.classList = {
            add:(...names) => { this.className = [...new Set([...this.className.split(' '),...names])].join(' '); },
            remove:(...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            contains:name => this.className.split(' ').includes(name),
            toggle:(name,force) => { if (force ?? !this.classList.contains(name)) this.classList.add(name); else this.classList.remove(name); },
        };
    }
    get id() { return this.attributes.id; }
    set id(value) { this.attributes.id = value; }
    get className() { return this.attributes.class || ''; }
    set className(value) { this.attributes.class = value; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children = []; this._text = String(value); }
    set innerHTML(html) {
        this._html = html;
        this._text = '';
        this.children.forEach(child => { child.parent = null; });
        this.children = [];
        const stack = [this];
        for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)) {
            const [token, tag, rest, text] = match;
            if (text !== undefined) { stack.at(-1)._text += decode(text); continue; }
            if (token.startsWith('</')) {
                const index = stack.findLastIndex(item => item.tagName === tag.toUpperCase());
                if (index > 0) stack.splice(index);
                continue;
            }
            const attributes = Object.fromEntries([...rest.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(([,key,value]) => [key,decode(value ?? '')]));
            const child = stack.at(-1).appendChild(new Element(tag,attributes));
            if (!['input','img','br','hr','meta','link'].includes(tag) && !rest.endsWith('/')) stack.push(child);
        }
        for (const item of this.querySelectorAll('textarea,option')) {
            if (item.tagName === 'TEXTAREA' || !('value' in item.attributes)) item.value = item.textContent;
        }
        for (const select of this.querySelectorAll('select')) select.value = (select.querySelector('option[selected]') || select.querySelector('option'))?.value || '';
    }
    get innerHTML() { return this._html || ''; }
    matches(selector) {
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
        const match = selector.match(/^([\w-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
        return Boolean(match && (!match[1] || this.tagName === match[1].toUpperCase()) && (!match[2] || (match[2] in this.attributes && (match[3] === undefined || this.attributes[match[2]] === match[3]))));
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [child,...child.querySelectorAll('*')]).filter(child => selector === '*' || selector.split(',').some(part => child.matches(part.trim()))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    before(node) {
        if (!this.parent) return;
        const index = this.parent.children.indexOf(this);
        if (index < 0) return;
        node.parent = this.parent;
        this.parent.children.splice(index, 0, node);
    }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    setAttribute(name,value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type,callback) { (this.listeners[type] ||= []).push(callback); }
    dispatch(type, values = {}) {
        const event = {target:this,preventDefault(){},...values};
        for (let current = this; current; current = current.parent) {
            event.currentTarget = current;
            for (const listener of current.listeners[type] || []) listener(event);
        }
    }
    click() { this.dispatch('click'); }
    focus() { this.focused = true; }
    scrollTo() {}
}

function makeStorage(entries = {}) {
    const values = new Map(Object.entries(entries));
    return {
        values, fail:false, writes:0,
        getItem:name => values.get(name) ?? null,
        setItem(name,value) { if (this.fail) throw new Error('quota exceeded'); values.set(name,String(value)); this.writes++; },
        removeItem(name) { values.delete(name); },
    };
}

function harness(storage = makeStorage(), search = '', pagePath = 'create.html', bodyPage = 'test', localStore = {}) {
    const root = new Element('body',{'data-page':bodyPage});
    root.innerHTML = '<div id="app"></div>';
    const document = {
        body:root,documentElement:{dataset:{},style:{setProperty(name,value){this[name]=value;}}},referrer:'',
        querySelector:selector => root.querySelector(selector),querySelectorAll:selector => root.querySelectorAll(selector),
        getElementById:id => root.querySelector('#' + id),
        createElement:tag => new Element(tag), addEventListener:(...args) => root.addEventListener(...args),
        removeEventListener:(...args) => root.removeEventListener?.(...args),
    };
    const modals = [], toasts = [], timers = [];
    const location = {href:`http://localhost/prototype/${pagePath}`,search,hostname:'localhost',replace(value) { this.href = value; }};
    const context = {
        document,location,sessionStorage:storage,localStorage:makeStorage(localStore),URL,URLSearchParams,console,atob:globalThis.atob,TextDecoder:globalThis.TextDecoder,
        matchMedia:() => ({matches:false}),
        innerHeight:800,innerWidth:1200,scrollY:0,scrollX:0,
        addEventListener(){},removeEventListener(){},requestAnimationFrame:() => 1,cancelAnimationFrame(){},
        window:{addEventListener(){},innerHeight:800,innerWidth:1200,scrollY:0,scrollX:0,visualViewport:undefined},
        history:{replaceState(_state,_title,url) { location.href = url; location.search = new URL(url,'http://localhost/prototype/').search; }},
        setTimeout(callback) { timers.push(callback); return timers.length; },clearTimeout(){},
        captureToast:(...args) => toasts.push(args),
        captureModal(options) {
            const overlay = root.appendChild(new Element());
            overlay.innerHTML = options.body;
            const close = () => overlay.remove();
            modals.push({...options,overlay,close});
            return {overlay,close};
        },
    };
    vm.createContext(context);
    const instrumented = source.replace(/\}\)\(\);\s*$/, `
        toast = captureToast;
        openModal = captureModal;
        globalThis.inspect = expression => eval(expression);
    })();`);
    vm.runInContext(instrumented,context,{filename:'platform.js'});
    const run = expression => context.inspect(expression);
    const find = selector => { const element = document.querySelector(selector); assert.ok(element,`${selector} must exist`); return element; };
    const click = selector => find(selector).click();
    const fill = (selector,value) => { find(selector).value = value; find(selector).dispatch('input'); };
    const confirm = () => { const modal = modals.at(-1); return modal.onConfirm?.(modal.overlay,modal.close); };
    const saved = () => JSON.parse(storage.getItem(key));
    return {run,find,click,fill,confirm,saved,storage,modals,toasts,root,location,timers};
}

function createFields(h, name = '我的巡夜人') {
    h.fill('#create-name',name);
    h.fill('#create-hook','沿着旧城的灯火寻找失踪的人。');
    h.fill('#create-greeting','你来了。今晚我们走哪一条路？');
    h.fill('#create-personality','耐心，尊重玩家自己的决定。');
    h.fill('#create-scenario','一座灯火未熄的山城。');
    h.fill('#create-instructions','私有指令：不要替玩家行动。');
    h.fill('#create-category','悬疑');
    h.fill('#create-tags','慢热，旧城、群像');
    h.find('#create-nsfw').checked = true;
    h.click('#add-greeting');
    h.find('#alternate-greetings').querySelector('textarea').value = '备用场景：你在渡口等他。';
}

function newRoom(h) {
    return h.run(`createRoom('测试共享房间',['shen-yanzhi','lin-wanzhao'])`);
}

test('v1 migrates without losing messages/flags, preserves exact recovery bytes and old room preview', () => {
    const legacy = {version:1,chats:[{id:'old-chat',characterId:'shen-yanzhi',personaId:'night',title:'旧故事',count:999,lastMessage:'过期',messages:[{role:'user',text:'不可丢失',extra:42}]}],rooms:[{id:'old-room',chatId:'old-room-chat',name:'旧房间',members:['shen-yanzhi','lin-wanzhao'],count:18,lastMessage:'旧版唯一保存的预览'}],characters:{'shen-yanzhi':{added:false,favorite:false}},extension:{preserve:true}};
    const raw = JSON.stringify(legacy);
    const storage = makeStorage({[key]:raw});
    const h = harness(storage);
    const saved = h.saved();
    assert.equal(saved.version,2);
    assert.deepEqual(saved.chats[0].messages.map(({id,candidates,selectedCandidate,...message})=>message),legacy.chats[0].messages);
    assert.ok(saved.chats[0].messages[0].id);
    assert.deepEqual(saved.chats[0].messages[0].candidates,['不可丢失']);
    assert.equal(saved.chats[0].messages[0].selectedCandidate,0);
    assert.equal(saved.chats[0].count,1);
    assert.equal(saved.chats[0].lastMessage,'不可丢失');
    assert.equal(saved.characters['shen-yanzhi'].favorite,false);
    assert.deepEqual(saved.extension,{preserve:true});
    assert.match(saved.rooms[0].messages[0].text,/旧版唯一保存的预览/);
    assert.equal(saved.rooms[0].count,1);
    assert.ok([...storage.values.entries()].some(([name,value]) => name.startsWith(`${key}-recovery-`) && value === raw));
    const count = storage.values.size;
    const reloaded = harness(storage);
    assert.equal(reloaded.run('rooms[0].messages.length'),1);
    assert.equal(storage.values.size,count,'normal v2 reload must not keep generating recovery backups');
});

test('malformed JSON is left untouched, then backed up before a successful explicit save', () => {
    const raw = '{broken but still valuable';
    const storage = makeStorage({[key]:raw});
    const h = harness(storage);
    assert.equal(storage.getItem(key),raw);
    assert.doesNotThrow(() => h.run('renderRooms()'));
    assert.ok(h.run(`savePersona(null,{name:'救回身份',description:'测试'})`));
    assert.equal(h.saved().version,2);
    assert.ok([...storage.values.entries()].some(([name,value]) => name.startsWith(`${key}-recovery-`) && value === raw));
});

test('malformed records and missing references do not blank chat, room or library views', () => {
    const h = harness(makeStorage({[key]:JSON.stringify({version:2,chats:[null,{id:'broken-chat',characterId:'missing-role',title:3,messages:[null,{role:'assistant',text:42}]}],rooms:[null,{id:'broken-room',chatId:'broken-room-chat',members:[null,'missing-role'],messages:'invalid'}],personas:[null,{id:'weird-persona',name:12,description:{}}],creatorWorks:[null,{id:'broken-work',tags:{}}]})}));
    assert.doesNotThrow(() => h.run('renderChats()'));
    h.location.search = '?chat=broken-chat';
    assert.doesNotThrow(() => h.run('renderChat()'));
    assert.doesNotThrow(() => h.run(`renderRoomChat('broken-room-chat')`));
    assert.doesNotThrow(() => h.run('renderLibrary()'));
    assert.equal(h.run('chats[0].messages[0].text'),'');
    assert.equal(h.run(`getCharacter('missing-role').missing`),true);
});

test('future schemas and quota failures never overwrite the existing payload or report success', () => {
    const raw = JSON.stringify({version:999,chats:[{text:'future data'}]});
    const h = harness(makeStorage({[key]:raw}));
    assert.equal(h.run(`savePersona(null,{name:'不应写入'})`),null);
    assert.equal(h.storage.getItem(key),raw);
    assert.match(h.toasts.at(-1)[0],/版本较新/);
    const legacy = JSON.stringify({version:1,chats:[],rooms:[]});
    const storage = makeStorage({[key]:legacy});
    storage.fail = true;
    const blocked = harness(storage);
    assert.equal(storage.getItem(key),legacy);
    assert.equal(blocked.run(`saveCreatorWork(null,{name:'不能假成功'})`),null);
    assert.equal(blocked.run('creatorWorks.length'),0);
    assert.equal(blocked.toasts.at(-1)[1],'err');
    storage.fail = false;
    assert.ok(blocked.run(`saveCreatorWork(null,{name:'重试保存'})`));
    assert.ok([...storage.values.values()].includes(legacy));
});

test('persona editor creates/edits one stable ID and survives settings, detail select and reload', () => {
    const h = harness();
    h.run('renderSettings()');
    h.run('openPersonaEditor(null)');
    h.fill('#persona-name','渡口旅人');
    h.fill('#persona-description','记得每一封未寄出的信。');
    h.confirm();
    const persona = h.saved().personas.find(item => item.name === '渡口旅人');
    assert.ok(persona.id.startsWith('persona-'));
    assert.ok(h.find(`[data-edit-persona="${persona.id}"]`));
    const next = harness(h.storage,'?id=lu-shiyan');
    next.run('renderCharacter()');
    assert.ok(next.find(`option[value="${persona.id}"]`));
    next.find('#persona-select').value = persona.id;
    next.find('#persona-select').dispatch('change');
    next.click('#new-story');
    assert.equal(next.saved().chats.at(-1).personaId,persona.id);
    next.run(`openPersonaEditor(getPersona('${persona.id}'))`);
    assert.equal(next.find('#persona-description').value,'记得每一封未寄出的信。');
    next.fill('#persona-name','归来的旅人');
    next.fill('#persona-description','新描述，不更换身份 ID。');
    next.confirm();
    assert.equal(next.saved().personas.filter(item => item.id === persona.id).length,1);
    assert.equal(harness(next.storage).run(`getPersona('${persona.id}').description`),'新描述，不更换身份 ID。');
});

test('chat persona switch uses saved custom identity and leaves history unchanged across reload', () => {
    const h = harness();
    const persona = h.run(`savePersona(null,{name:'新身份',description:'自定义设定'})`);
    h.location.search = '?chat=chat-shen-1';
    h.run('renderChat()');
    const before = copy(h.run('currentChat.messages'));
    h.click('#chat-more');
    h.click('#tool-persona');
    h.click(`[data-persona-choice="${persona.id}"]`);
    assert.equal(h.saved().chats.find(chat => chat.id === 'chat-shen-1').personaId,persona.id);
    assert.deepEqual(copy(h.run('currentChat.messages')),before);
    const reload = harness(h.storage,'?chat=chat-shen-1');
    reload.run('renderChat()');
    assert.match(reload.find('#rp-compose-persona').textContent,/新身份/);
    assert.match(reload.find('.p-rp-status').textContent,/本地模拟/);
});

test('persona quota failure keeps editor open and preserves prior identity', () => {
    const h = harness();
    h.run('saveState()');
    const before = h.storage.getItem(key);
    h.run(`openPersonaEditor(getPersona('night'))`);
    h.fill('#persona-name','不应覆盖');
    h.storage.fail = true;
    assert.equal(h.confirm(),false);
    assert.ok(h.find('#persona-name'));
    assert.equal(h.run(`getPersona('night').name`),'都市夜行');
    assert.equal(h.storage.getItem(key),before);
    assert.equal(h.toasts.at(-1)[1],'err');
});

test('partial draft can be saved, then every text field and alternate greeting reloads under its own ID', () => {
    const h = harness();
    h.run('renderCreate()');
    h.fill('#create-name','未写完的角色');
    h.find('#character-form').dispatch('submit');
    const id = h.saved().creatorWorks[0].id;
    assert.ok(id.startsWith('created-'));
    assert.equal(h.location.search,`?edit=${id}`);
    createFields(h);
    h.find('#character-form').dispatch('submit');
    assert.equal(h.saved().creatorWorks.length,1);
    const saved = h.saved().creatorWorks[0];
    const reload = harness(h.storage,`?edit=${id}`);
    reload.run('renderCreate()');
    for (const field of ['name','hook','greeting','personality','scenario','instructions','category']) assert.equal(reload.find(`#create-${field}`).value,saved[field]);
    assert.equal(reload.find('#create-tags').value,'慢热、旧城、群像');
    assert.equal(reload.find('#create-nsfw').checked,true);
    assert.equal(reload.find('#alternate-greetings').querySelector('textarea').value,saved.alternateGreetings[0]);
    assert.equal(reload.run('Object.values(characters).some(c => c.local)'),false,'private drafts must not leak into discovery catalogue');
    reload.run('renderCreateWorks()');
    assert.ok(reload.root.querySelectorAll('a').some(link => link.getAttribute('href') === `create.html?edit=${id}`));
    reload.run('renderLibrary()');
    reload.click('[data-library-tab="created"]');
    assert.ok(reload.root.querySelectorAll('a').some(link => link.getAttribute('href') === `create.html?edit=${id}`));
});

test('private trial from editor and works uses the custom character and greeting, never Shen', () => {
    const h = harness();
    h.run('renderCreate()');
    createFields(h);
    h.click('#create-test-chat');
    const work = h.saved().creatorWorks[0];
    const chat = h.saved().chats.at(-1);
    assert.equal(chat.characterId,work.id);
    assert.notEqual(chat.characterId,'shen-yanzhi');
    assert.equal(chat.messages[0].text,work.greeting);
    assert.equal(h.location.href,`chat.html?chat=${chat.id}`);
    const reload = harness(h.storage,`?chat=${chat.id}`);
    reload.run('renderChat()');
    assert.equal(reload.find('.p-chat-name').textContent,work.name);
    assert.match(reload.find('.p-rp-status').textContent,/本地模拟/);
    assert.equal(reload.run('currentChat.characterSnapshot.id'),work.id);
    assert.ok(reload.find('[data-context-action="snapshot"]'));
    reload.fill('#message-input','一起去渡口。');
    reload.click('#send-message');
    reload.timers.at(-1)();
    assert.match(reload.saved().chats.at(-1).messages.at(-1).text,new RegExp(work.name));
    reload.run('renderCreateWorks()');
    reload.click('[data-creator-filter="draft"]');
    reload.find(`[data-work-test="${work.id}"]`).appendChild(new Element('span')).click();
    assert.equal(reload.saved().chats.at(-1).characterId,work.id);
    assert.equal(reload.saved().chats.at(-1).messages[0].text,work.greeting);
});

test('editing a private character affects its next trial without rewriting old messages', () => {
    const h = harness();
    h.run('renderCreate()');
    createFields(h);
    h.click('#create-test-chat');
    const first = copy(h.saved().chats.at(-1));
    const workId = first.characterId;
    const edit = harness(h.storage,`?edit=${workId}`);
    edit.run('renderCreate()');
    edit.fill('#create-greeting','新的开场，不是另一位角色。');
    edit.click('#create-test-chat');
    const saved = edit.saved();
    assert.equal(saved.creatorWorks.length,1);
    assert.equal(saved.chats.at(-1).characterId,workId);
    assert.equal(saved.chats.at(-1).messages[0].text,'新的开场，不是另一位角色。');
    assert.deepEqual(saved.chats.find(chat => chat.id === first.id).messages,first.messages);
});

test('publish saves only local simulated review; filters keep delegated status controls live', () => {
    const h = harness();
    h.run('renderCreate()');
    createFields(h);
    h.click('#publish-character');
    assert.match(h.modals.at(-1).title,/本地模拟审核/);
    assert.equal(h.confirm(),false);
    h.find('#publish-agree').checked = true;
    h.confirm();
    const work = h.saved().creatorWorks[0];
    assert.equal(work.status,'pending');
    assert.equal(work.review.status,'local-pending');
    assert.match(work.review.note,/未发送到服务端/);
    const reload = harness(h.storage,'?tab=works');
    reload.run('renderCreate()');
    for (let count = 0; count < 2; count++) {
        reload.click('[data-creator-filter="draft"]');
        reload.click('[data-creator-filter="pending"]');
        reload.find(`[data-work-status="${work.id}"]`).appendChild(new Element('span')).click();
        assert.match(reload.modals.at(-1).body,/没有发送到服务端/);
        reload.modals.at(-1).close();
    }
});

test('draft save failure neither navigates nor shows saved status; user input remains retryable', () => {
    const h = harness();
    h.run('renderCreate()');
    createFields(h);
    h.storage.fail = true;
    h.click('#create-test-chat');
    assert.equal(h.run('creatorWorks.length'),0);
    assert.equal(h.run('chats.length'),4);
    assert.equal(h.location.search,'');
    assert.equal(h.find('#create-name').value,'我的巡夜人');
    assert.match(h.find('#create-save-status').textContent,/保存失败/);
    assert.equal(h.toasts.at(-1)[1],'err');
    h.storage.fail = false;
    h.find('#character-form').dispatch('submit');
    assert.equal(h.saved().creatorWorks.length,1);
});

test('unknown edit ID never opens a demo character or creates a replacement resource', () => {
    const h = harness(makeStorage(),'?edit=nonexistent');
    h.run('renderCreate()');
    assert.match(h.find('#app').textContent,/找不到这份本地草稿/);
    assert.equal(h.root.querySelector('#character-form'),null);
    assert.equal(h.run('creatorWorks.length'),0);
});

test('room creator opens one saved room; empty send is blocked; transcript survives reload and next speaker advances', () => {
    const h = harness();
    h.run('openRoomCreator()');
    h.find('#room-name').value = '共享的夜晚';
    const inputs = h.root.querySelectorAll('input[name="room-member"]');
    inputs[0].checked = inputs[1].checked = true;
    h.confirm();
    const room = h.saved().rooms.at(-1);
    assert.equal(h.location.href,`chat.html?chat=${room.chatId}`);
    const page = harness(h.storage,`?chat=${room.chatId}`);
    page.run('renderChat()');
    const before = page.storage.getItem(key);
    page.fill('#room-message-input','   \n ');
    const writes = page.storage.writes;
    page.click('#room-send');
    assert.equal(page.storage.writes,writes);
    assert.equal(page.saved().rooms.at(-1).messages.length,room.messages.length);
    page.fill('#room-message-input','这一次我们一起走。');
    page.click('#room-send');
    const first = page.saved().rooms.at(-1);
    assert.equal(first.messages.at(-2).role,'user');
    assert.equal(first.messages.at(-2).text,'这一次我们一起走。');
    assert.equal(first.messages.at(-1).speakerId,room.members[0]);
    assert.equal(first.messages.at(-1).simulation,true);
    assert.equal(first.count,first.messages.length);
    assert.equal(first.lastMessage,first.messages.at(-1).text);
    assert.notEqual(page.storage.getItem(key),before);
    const reload = harness(page.storage,`?chat=${room.chatId}`);
    reload.run('renderChat()');
    assert.match(reload.find('#room-messages').textContent,/这一次我们一起走/);
    reload.fill('#room-message-input','轮到下一位。');
    reload.click('#room-send');
    const next = reload.saved().rooms.at(-1);
    assert.equal(next.messages.at(-1).speakerId,room.members[1]);
    assert.deepEqual(next.messages.slice(0,first.messages.length),first.messages);
});

test('room settings save/read manual speaker and free discussion; draft survives leaving and coming back', () => {
    const h = harness();
    const room = newRoom(h);
    h.run(`renderRoomChat('${room.chatId}')`);
    h.fill('#room-message-input','还没发出的房间草稿');
    h.click('#room-settings');
    h.find('#room-strategy').value = 'manual';
    h.find('#room-settings-speaker').value = 'lin-wanzhao';
    h.confirm();
    assert.equal(h.find('#room-message-input').value,'还没发出的房间草稿');
    const reload = harness(h.storage,`?chat=${room.chatId}`);
    reload.run('renderChat()');
    assert.equal(reload.find('#room-message-input').value,'还没发出的房间草稿');
    assert.equal(reload.find('#room-speaker').hidden,false);
    assert.equal(reload.find('#room-speaker').value,'lin-wanzhao');
    reload.click('#room-settings');
    assert.equal(reload.find('#room-strategy').value,'manual');
    assert.equal(reload.find('#room-settings-speaker').value,'lin-wanzhao');
    reload.modals.at(-1).close();
    reload.click('#room-send');
    assert.equal(reload.saved().rooms.at(-1).messages.at(-1).speakerId,'lin-wanzhao');
    reload.click('#room-settings');
    reload.find('#room-strategy').value = 'free';
    reload.confirm();
    const before = reload.saved().rooms.at(-1).messages.length;
    reload.fill('#room-message-input','所有人都来回答。');
    reload.click('#room-send');
    const after = reload.saved().rooms.at(-1);
    assert.equal(after.messages.length,before+3);
    assert.deepEqual(after.messages.slice(-2).map(message => message.speakerId),['shen-yanzhi','lin-wanzhao']);
    assert.equal(harness(reload.storage).run('rooms.at(-1).strategy'),'free');
});

test('room save failure retains input/transcript/strategy and does not claim success', () => {
    const h = harness();
    const room = newRoom(h);
    h.run(`renderRoomChat('${room.chatId}')`);
    h.fill('#room-message-input','不能丢失的输入');
    const before = copy(h.run('rooms.at(-1)'));
    h.storage.fail = true;
    h.click('#room-send');
    assert.equal(h.find('#room-message-input').value,'不能丢失的输入');
    assert.deepEqual(copy(h.run('rooms.at(-1)')),before);
    h.click('#room-settings');
    h.find('#room-strategy').value = 'free';
    assert.equal(h.confirm(),false);
    assert.equal(h.run('rooms.at(-1).strategy'),before.strategy);
    assert.ok(h.find('#room-strategy'));
    assert.equal(h.toasts.at(-1)[1],'err');
});

test('pending import, password, redemption, and deletion do not pretend success or clear saved RP data', () => {
    const h = harness();
    h.run(`savePersona(null,{name:'必须保留'})`);
    const before = h.storage.getItem(key);
    h.run('openImport()');
    assert.equal(h.modals.at(-1).title,'导入角色卡');
    assert.match(h.modals.at(-1).body,/type="file"/);
    assert.match(h.modals.at(-1).body,/card-json/);
    assert.equal(h.storage.getItem(key),before);
    h.modals.at(-1).close();
    h.run('openDeleteAccount()');
    assert.match(h.modals.at(-1).body,/不会删除/);
    assert.equal(h.modals.at(-1).onConfirm,undefined);
    assert.equal(h.storage.getItem(key),before);
    h.modals.at(-1).close();
    h.run('renderSettings(); bindGlobal()');
    h.click('#change-password');
    assert.match(h.modals.at(-1).body,/请勿.*真实密码/);
    h.modals.at(-1).close();
    h.click('#redeem');
    assert.match(h.modals.at(-1).body,/不会兑换或到账/);
    assert.equal(h.storage.getItem(key),before);
});

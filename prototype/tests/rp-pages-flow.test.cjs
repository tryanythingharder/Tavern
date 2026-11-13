'use strict';

// 复用完整生产闭包的 DOM/存储替身；不将此测试声称为浏览器验收。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const prototypeDir = path.resolve(__dirname, '..');
const harnessSource = fs.readFileSync(path.join(prototypeDir, 'rp-state.test.cjs'), 'utf8').split("test('")[0];
const exportsBox = {exports:{}};
vm.runInNewContext(`${harnessSource}\nmodule.exports={harness,makeStorage,createFields};`, {
    require,__dirname:prototypeDir,module:exportsBox,URL,URLSearchParams,console,
});
const {harness,makeStorage,createFields} = exportsBox.exports;
const key = 'rp-platform-state';
const copy = value => JSON.parse(JSON.stringify(value));
const bind = h => h.run(`document.documentElement.style={values:{},setProperty(key,value){this.values[key]=value;}}; window.listeners={}; window.addEventListener=(name,fn)=>{window.listeners[name]=fn;}; bindGlobal();`);

test('聊天搜索匹配中间历史消息及房间消息，而非仅最后一条', () => {
    const h=harness();
    h.run(`chats[0].messages=[{role:'user',text:'中间历史的钥匙'},{role:'assistant',text:'尾消息'}]; rooms[0].messages=[{role:'assistant',text:'房间深处的线索'},{role:'user',text:'普通结尾'}]; renderChats();`);
    h.fill('#chat-query','中间历史的钥匙');
    assert.match(h.find('#chat-list').innerHTML,/chat-shen-1/);
    assert.doesNotMatch(h.find('#chat-list').innerHTML,/chat-lin-1/);
    h.fill('#chat-query','房间深处的线索');
    assert.match(h.find('#chat-list').innerHTML,/room-1/);
    h.fill('#chat-query','完全不存在的文本');
    assert.match(h.find('#chat-list').textContent,/没有找到匹配/);
    h.click('#clear-chat-search');
    assert.equal(h.find('#chat-query').value,'');
    assert.equal(h.find('#chat-character').value,'all');
});

test('私人角色进入筛选器且筛选会显示该角色所在房间', () => {
    const h=harness();
    h.run(`saveCreatorWork('my-role',{name:'私人巡夜人',hook:'私人故事',greeting:'你好'}); chats.push({id:'private-story',characterId:'my-role',title:'私人第一幕',updated:99,messages:[]}); rooms[0].members.push('my-role'); renderChats();`);
    assert.match(h.find('#chat-character').textContent,/私人巡夜人 · 私人/);
    h.find('#chat-character').value='my-role';
    h.find('#chat-character').dispatch('change');
    assert.match(h.find('#chat-list').innerHTML,/private-story/);
    assert.match(h.find('#chat-list').innerHTML,/room-1/);
    assert.doesNotMatch(h.find('#chat-list').innerHTML,/chat-shen-1/);
    assert.match(h.find('#chat-list').textContent,/0 条/);
});

test('单聊和房间统一按 updated 排序且展示身份与分支', () => {
    const h=harness();
    h.run(`chats[0].updated=50; chats[1].updated=100; chats[2].updated=1; chats[3].updated=0; rooms[0].updated=75; chats[1].branch={sourceChatId:'chat-shen-1'}; renderChats();`);
    const links=h.find('#chat-list').querySelectorAll('.p-chat-open').map(link=>link.getAttribute('href'));
    assert.deepEqual(Array.from(links.slice(0,3)),['chat.html?chat=chat-shen-2','chat.html?chat=room-1','chat.html?chat=chat-shen-1']);
    assert.match(h.find('#chat-list').textContent,/玩家：/);
    assert.match(h.find('#chat-list').textContent,/分支来源：chat-shen-1/);
    assert.match(h.find('#chat-list').textContent,/本地保存/);
    h.run(`chats[1].branchSource={chatId:'origin',messageId:'m2',label:'原故事 · 第2条'}; renderChats();`);
    assert.match(h.find('#chat-list').textContent,/分支来源：原故事 · 第2条/);
});

test('角色库区分查看、继续和新故事，标签搜索有效', () => {
    const h=harness();
    h.run('renderLibrary()');
    const links=h.find('#library-list').querySelectorAll('a');
    const continuation=links.find(link=>link.textContent==='继续故事');
    const start=links.find(link=>link.textContent==='新故事');
    assert.match(continuation.getAttribute('href'),/^chat\.html\?chat=/);
    assert.match(start.getAttribute('href'),/^character\.html\?id=.*&start=new$/);
    assert.ok(links.some(link=>link.textContent==='查看角色'));
    h.fill('#library-query','守护');
    assert.match(h.find('#library-list').textContent,/白露/);
    assert.doesNotMatch(h.find('#library-list').textContent,/林晚照/);
});

test('移除与撤销仅更新库标记，保存失败不丢标记或故事', () => {
    const h=harness();
    h.run('renderLibrary()');
    const count=h.run('chats.length');
    h.click('[data-library-remove="shen-yanzhi"]');
    assert.equal(h.run("characters['shen-yanzhi'].added"),false);
    assert.equal(h.run('chats.length'),count);
    assert.match(h.find('[data-library-tab="added"]').textContent,/2/);
    h.click('#undo-library-change');
    assert.equal(h.run("characters['shen-yanzhi'].added"),true);
    h.storage.fail=true;
    h.click('[data-library-remove="shen-yanzhi"]');
    assert.equal(h.run("characters['shen-yanzhi'].added"),true);
    assert.match(h.find('#library-list').textContent,/沈砚之/);
    assert.equal(h.run('chats.length'),count);
});

test('收藏取消可撤销，失败保留收藏状态', () => {
    const h=harness();
    h.run('renderLibrary()');
    h.click('[data-library-tab="favorites"]');
    h.click('[data-library-remove="lin-wanzhao"]');
    assert.equal(h.run("characters['lin-wanzhao'].favorite"),false);
    h.click('#undo-library-change');
    h.storage.fail=true;
    h.click('[data-library-remove="lin-wanzhao"]');
    assert.equal(h.run("characters['lin-wanzhao'].favorite"),true);
});

test('昵称和聊天字号保存回读，失败时回滚且 CSS 变量生效', () => {
    const h=harness();
    bind(h);
    h.run('renderSettings()');
    h.fill('#nickname','本地旅人');
    h.click('#save-account');
    h.fill('#font-range','115');
    assert.equal(h.saved().profile.nickname,'本地旅人');
    assert.equal(h.saved().preferences.chatFontScale,1.15);
    assert.equal(h.run("document.documentElement.style.values['--rp-font-scale']"),'1.15');
    const reloaded=harness(h.storage);
    bind(reloaded);
    reloaded.run('renderSettings()');
    assert.equal(reloaded.find('#nickname').value,'本地旅人');
    assert.equal(reloaded.find('#font-range').value,'115');
    reloaded.storage.fail=true;
    reloaded.fill('#nickname','失败昵称');
    reloaded.click('#save-account');
    reloaded.fill('#font-range','90');
    assert.equal(reloaded.find('#nickname').value,'本地旅人');
    assert.equal(reloaded.find('#font-range').value,'115');
    assert.equal(reloaded.run("document.documentElement.style.values['--rp-font-scale']"),'1.15');
});

test('完整备份包含私人作品房间消息候选快照以及未知字段，不伪造余额', () => {
    const h=harness();
    h.run(`saveCreatorWork('private-export',{name:'私人角色',instructions:'私人设定',greeting:'开场'}); stateExtras.extension={keep:42}; chats[0].messages[0].candidates=['一','二']; chats[0].branch={sourceChatId:'origin'}; chats[0].snapshot={revision:2}; rooms[0].context={summary:'房间上下文'}; globalThis.Blob=class {constructor(parts){globalThis.exported=parts.join('');}}; URL.createObjectURL=()=> 'blob:local-test'; URL.revokeObjectURL=()=>{}; exportAccountData();`);
    const payload=JSON.parse(h.run('exported'));
    assert.equal(payload.format,'rp-platform-local-backup');
    assert.equal(payload.version,2);
    assert.equal(payload.extension.keep,42);
    assert.equal(payload.creatorWorks[0].instructions,'私人设定');
    assert.deepEqual(payload.chats[0].messages[0].candidates,['一','二']);
    assert.equal(payload.chats[0].branch.sourceChatId,'origin');
    assert.equal(payload.chats[0].snapshot.revision,2);
    assert.equal(payload.rooms[0].context.summary,'房间上下文');
    for(const field of ['personas','selectedPersona','characters','notifications','reports','blockedCreators']) assert.ok(field in payload);
    assert.equal(payload.profile?.points,undefined);
});

test('创建实时预览公开字段且不泄露私有指令，失败保存保持 dirty 与原草稿', () => {
    const h=harness();
    bind(h);
    h.run('renderCreate()');
    createFields(h,'巡夜者');
    const preview=h.find('#creator-live-preview').textContent;
    assert.match(preview,/巡夜者/);
    assert.match(preview,/耐心，尊重玩家/);
    assert.match(preview,/一座灯火未熄的山城/);
    assert.match(preview,/慢热/);
    assert.doesNotMatch(preview,/私有指令：不要替玩家行动/);
    assert.equal(h.run('creatorDirty'),true);
    assert.equal(h.run(`(()=>{let prevented=false;window.listeners.beforeunload({preventDefault(){prevented=true;}});return prevented;})()`),true);
    h.find('#character-form').dispatch('submit');
    assert.equal(h.run('creatorDirty'),false);
    const workId=h.saved().creatorWorks[0].id;
    h.fill('#create-name','修改后');
    h.storage.fail=true;
    h.find('#character-form').dispatch('submit');
    assert.equal(h.run('creatorDirty'),true);
    assert.equal(h.saved().creatorWorks[0].name,'巡夜者');
    h.storage.fail=false;
    h.find('#character-form').dispatch('submit');
    assert.equal(h.saved().creatorWorks[0].id,workId);
    assert.equal(h.saved().creatorWorks[0].name,'修改后');
});

test('备份入口可下载，恢复与设备管理明确未接入而不伪造成功', () => {
    const h=harness();
    bind(h);
    h.run('renderSettings(); globalThis.Blob=class {constructor(parts){globalThis.exported=parts.join(\'\');}}; URL.createObjectURL=()=>\'blob:backup-test\';');
    h.click('#data-backup');
    h.click('#download-backup');
    assert.equal(JSON.parse(h.run('exported')).format,'rp-platform-local-backup');
    h.click('#restore-backup');
    assert.match(h.modals.at(-1).title,/尚未接入/);
    h.run('openActiveSessions()');
    assert.match(h.modals.at(-1).title,/静态示例/);
    assert.ok(h.modals.at(-1).overlay.querySelector('button').disabled);
    assert.ok(!h.toasts.some(([text])=>/其他设备已退出/.test(text)));
});

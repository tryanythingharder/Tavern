'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// 复用现有完整闭包 VM / DOM harness，不复制生产函数，不加载旧测试用例。
const directory = path.resolve(__dirname,'..');
const harnessSource = fs.readFileSync(path.join(directory,'rp-state.test.cjs'),'utf8').split('\nfunction createFields(')[0];
const shared = {require,__dirname:directory,URL,URLSearchParams,console};
vm.runInNewContext(`${harnessSource}\nglobalThis.sharedHarness={harness,makeStorage};`,shared);
const {harness,makeStorage} = shared.sharedHarness;
const copy = value => JSON.parse(JSON.stringify(value));
const key = 'rp-platform-state';
function chatHarness(storage) {
    const h = harness(storage,'?chat=chat-lin-1');
    h.run('renderChat()');
    return h;
}
function historyHarness() {
    const h=chatHarness();
    h.run(`commitChat(currentChat,chat=>{chat.messages=normalizeMessages([{role:'assistant',text:'第一幕'},{role:'user',text:'我的行动'},{role:'assistant',text:'第三幕'}]);})`);
    h.run('drawMessages()');
    return h;
}

test('重试保留原文候选、稳定消息ID，并在原位切换',()=>{
    const h=chatHarness(), original=copy(h.run('currentChat.messages[0]'));
    h.run(`messageAction('regenerate',0)`);
    const message=copy(h.run('currentChat.messages[0]'));
    assert.equal(message.id,original.id);
    assert.equal(message.candidates[0],original.text);
    assert.equal(message.candidates.length,2);
    assert.equal(message.text,message.candidates[1]);
    h.run(`messageAction('previous',0)`);
    assert.equal(h.run('currentChat.messages[0].text'),original.text);
    h.run(`messageAction('next',0)`);
    assert.equal(h.run('currentChat.messages[0].text'),message.text);
    assert.equal(h.run('currentChat.messages.length'),1);
});

test('历史重试需确认，前缀分支不修改原消息或后续',()=>{
    const h=historyHarness(), before=copy(h.run('currentChat'));
    h.run(`messageAction('regenerate',0)`);
    assert.deepEqual(copy(h.run('currentChat')),before);
    assert.match(h.modals.at(-1).title,/分支/);
    h.confirm();
    const branch=copy(h.run('chats.at(-1)'));
    assert.equal(branch.messages.length,1);
    assert.equal(branch.messages[0].candidates[0],'第一幕');
    assert.equal(branch.branchSource.messageId,before.messages[0].id);
    assert.equal(branch.branchSource.chatId,before.id);
    assert.deepEqual(copy(h.run('currentChat')),before);
});

test('历史候选切换创建独立分支，原选择保持不变',()=>{
    const h=historyHarness();
    h.run(`commitChat(currentChat,chat=>{chat.messages[0].candidates.push('另一个开端');})`);
    const before=copy(h.run('currentChat'));
    h.run(`messageAction('next',0)`);h.confirm();
    assert.equal(h.run('chats.at(-1).messages[0].text'),'另一个开端');
    assert.deepEqual(copy(h.run('currentChat')),before);
});

test('分支候选、角色快照和上下文世界书均深拷贝',()=>{
    const h=historyHarness();
    h.run(`commitChat(currentChat,chat=>{chat.context={memory:'原记忆',note:'原注释',lore:[{id:'lore-one',title:'条目',keywords:['行动'],text:'原设定',enabled:true}]};});messageAction('branch',1)`);
    h.run(`chats.at(-1).messages[0].candidates[0]='修改';chats.at(-1).context.lore[0].keywords.push('新增');chats.at(-1).characterSnapshot.name='其他角色'`);
    assert.equal(h.run('currentChat.messages[0].candidates[0]'),'第一幕');
    assert.equal(h.run('currentChat.context.lore[0].keywords.length'),1);
    assert.equal(h.run('currentChat.characterSnapshot.name'),'林晚照');
});

test('候选与分支保存失败回滚，不跳转或显示成功',()=>{
    const h=chatHarness(), before=copy(h.run('currentChat')), href=h.location.href, count=h.run('chats.length');
    h.storage.fail=true;
    h.run(`messageAction('regenerate',0)`);
    assert.deepEqual(copy(h.run('currentChat')),before);
    h.run(`messageAction('branch',0)`);
    assert.equal(h.run('chats.length'),count);
    assert.equal(h.location.href,href);
    assert.equal(h.toasts.at(-1)[1],'err');
});

test('末条编辑保留候选，空文本拒绝，保存失败保留编辑器',()=>{
    const h=chatHarness(), before=copy(h.run('currentChat'));
    h.run(`messageAction('edit',0)`);h.fill('#edit-message','   ');
    assert.equal(h.confirm(),false);
    h.fill('#edit-message','改写后的文本');h.storage.fail=true;
    assert.equal(h.confirm(),undefined);
    assert.deepEqual(copy(h.run('currentChat')),before);
    assert.ok(h.find('#edit-message'));
    h.storage.fail=false;h.confirm();
    assert.equal(h.run('currentChat.messages[0].candidates[0]'),before.messages[0].text);
    assert.equal(h.run('currentChat.messages[0].text'),'改写后的文本');
});

test('用户历史消息可编辑并创建前缀分支',()=>{
    const h=historyHarness(), before=copy(h.run('currentChat'));
    h.run(`messageAction('edit',1)`);h.fill('#edit-message','新的玩家行动');h.confirm();
    assert.match(h.modals.at(-1).title,/分支/);h.confirm();
    assert.equal(h.run('chats.at(-1).messages[1].text'),'新的玩家行动');
    assert.equal(h.run('chats.at(-1).messages.length'),2);
    assert.deepEqual(copy(h.run('currentChat')),before);
});

test('记忆与作者注释真实保存回读且失败回滚',()=>{
    const h=chatHarness();
    for(const [action,value] of [['memory','手动记录第一幕'],['note','希望放慢叙述']]){
        h.run(`openContextEditor(currentChat,'${action}')`);h.fill('#context-text',value);h.confirm();
    }
    const reload=chatHarness(h.storage);
    assert.equal(reload.run('currentChat.context.memory'),'手动记录第一幕');
    assert.equal(reload.run('currentChat.context.note'),'希望放慢叙述');
    reload.run(`openContextEditor(currentChat,'memory')`);
    assert.equal(reload.find('#context-text').value,'手动记录第一幕');
    reload.fill('#context-text','不应写入');reload.storage.fail=true;
    assert.equal(reload.confirm(),false);
    assert.equal(reload.run('currentChat.context.memory'),'手动记录第一幕');
});

test('世界书增改删、停用、关键词实际匹配与消息来源',()=>{
    const h=historyHarness();h.run('openLoreEditor(currentChat)');h.click('#lore-add');
    h.fill('#lore-title','行动记录');h.fill('#lore-keywords','行动，画廊');h.fill('#lore-text','本地设定');h.confirm();
    const id=h.run('currentChat.context.lore[0].id');
    assert.equal(h.run('loreMatches(currentChat).length'),1);
    assert.equal(h.run('loreMatches(currentChat)[0].hits[0].keyword'),'行动');
    assert.equal(h.run('loreMatches(currentChat)[0].hits[0].messageId'),h.run('currentChat.messages[1].id'));
    h.click(`[data-lore-edit="${id}"]`);h.find('#lore-enabled').checked=false;h.confirm();
    assert.equal(h.run('loreMatches(currentChat).length'),0);
    h.click(`[data-lore-delete="${id}"]`);assert.equal(h.run('currentChat.context.lore.length'),1);h.confirm();
    assert.equal(h.run('currentChat.context.lore.length'),0);
});

test('世界书只匹配最近12条选中消息，不匹配未选候选',()=>{
    const h=chatHarness();
    h.run(`commitChat(currentChat,chat=>{chat.messages=normalizeMessages([{role:'user',text:'过期关键词'},...Array.from({length:12},()=>({role:'user',text:'当前消息',candidates:['当前消息','隐藏关键词'],selectedCandidate:0}))]);chat.context.lore=[{id:'a',title:'过期',keywords:['过期关键词'],text:'A',enabled:true},{id:'b',title:'未选候选',keywords:['隐藏关键词'],text:'B',enabled:true}];})`);
    assert.equal(h.run('loreMatches(currentChat).length'),0);
});

test('消息多段保留且系统独立展示，纯文本上下文阻止HTML注入',()=>{
    const h=chatHarness();
    h.run(`commitChat(currentChat,chat=>{chat.messages=normalizeMessages([{role:'system',text:'<img src=x onerror=alert(1)>'},{role:'user',text:'第一段\\n\\n第二段<script>alert(1)</script>'}]);chat.context.note='<svg onload=alert(1)>';});drawMessages()`);
    assert.equal(h.root.querySelectorAll('script').length,0);
    // 头部立绘是产品资产；这里只约束消息区不得渲染注入的图片。
    assert.equal(h.find('#messages').querySelectorAll('img').length,0);
    assert.ok(h.find('.p-rp-system'));
    assert.match(h.find('.p-rp-system').textContent,/系统记录/);
    assert.ok(h.root.querySelectorAll('.p-msg-copy').at(-1).querySelectorAll('p').length===2);
    h.run('openContextPreview(currentChat)');
    assert.match(h.modals.at(-1).body,/&lt;svg/);
    assert.equal(h.modals.at(-1).overlay.querySelector('svg'),null);
});

test('停止后过期回调失效，忙碌修改阻止且不打断新草稿',()=>{
    const h=chatHarness();h.fill('#message-input','第一轮');h.click('#send-message');const callback=h.timers.at(-1);
    const before=copy(h.run('currentChat'));h.run(`messageAction('regenerate',0)`);
    assert.deepEqual(copy(h.run('currentChat')),before);
    h.fill('#message-input','尚未发送的下一轮');h.click('#stop-message');callback();
    assert.deepEqual(copy(h.run('currentChat')),before);
    assert.equal(h.find('#message-input').value,'尚未发送的下一轮');
    h.run(`openContextEditor(currentChat,'memory')`);h.fill('#context-text','记录');h.confirm();
    assert.equal(h.find('#message-input').value,'尚未发送的下一轮');
});

test('新故事冻结私人角色快照，旧记录明确无历史版本',()=>{
    const h=chatHarness();
    assert.match(h.run('currentChat.snapshotNote'),/旧记录未保存历史版本/);
    h.run(`saveCreatorWork('custom-role',{name:'原角色',greeting:'原开场',personality:'原设定'});newStory('custom-role')`);
    const id=h.run('chats.at(-1).id');h.run(`saveCreatorWork('custom-role',{name:'新角色',greeting:'新开场'})`);
    const next=harness(h.storage,`?chat=${id}`);next.run('renderChat()');
    assert.equal(next.run('currentChat.characterSnapshot.name'),'原角色');
    assert.equal(next.run('currentChat.openingText'),'原开场');
    assert.match(next.run('simulatedReply(currentChat)'),/原角色/);
});

test('重命名和删除写失败保持原数据与路由',()=>{
    const h=chatHarness(), before=copy(h.run('currentChat')), route=h.location.href;
    h.run('chatMenu(currentChat.id)');h.click('#rename-chat');h.fill('#chat-title','失败改名');h.storage.fail=true;h.confirm();
    assert.deepEqual(copy(h.run('currentChat')),before);assert.equal(h.location.href,route);
    h.storage.fail=false;h.modals.at(-1).close();h.click('#delete-chat');h.storage.fail=true;h.confirm();
    assert.equal(h.run(`Boolean(chatFor('${before.id}'))`),true);assert.equal(h.location.href,route);
});

test('聊天内重命名保留路由与草稿并同步标题',()=>{
    const h=chatHarness(), route=h.location.href;
    h.fill('#message-input','未发送的草稿');h.run('chatMenu(currentChat.id)');h.click('#rename-chat');h.fill('#chat-title','新的故事标题');h.confirm();
    assert.equal(h.location.href,route);
    assert.equal(h.find('#message-input').value,'未发送的草稿');
    assert.equal(h.find('#rp-story-title').textContent,'新的故事标题');
    assert.match(h.find('.p-rp-prologue').textContent,/新的故事标题/);
});

test('状态条独立、跳转按钮在聊天区，空输入保持一行且开场不重复',()=>{
    const h=chatHarness();
    assert.ok(h.find('.p-rp-status').parent.classList.contains('p-chat'));
    assert.ok(h.find('#chat-jump').parent.classList.contains('p-chat'));
    assert.equal(h.find('#message-input').style.height,'56px');
    const greeting=h.run('chatCharacter(currentChat).greeting');
    assert.ok(!h.find('.p-rp-prologue').textContent.includes(greeting));
    // 单候选不渲染 1/1 计数器与候选箭头，避免噪音；多候选时恢复且首条禁用
    assert.equal(h.run('!!document.querySelector(\'[data-message-action="previous"]\')'),false);
    assert.equal(h.run('!!document.querySelector(\'[data-message-action="next"]\')'),false);
    h.run('commitChat(currentChat,chat=>{const last=chat.messages.at(-1);last.candidates=[last.text,\'另一个候选\'];last.selectedCandidate=0;});drawMessages()');
    assert.equal(h.find('[data-message-action="previous"]').disabled,true);
    assert.ok(h.find('[data-message-action="next"]'));
    h.find('#message-input').scrollHeight=300;h.fill('#message-input','多行文本');
    assert.equal(h.find('#message-input').style.height,'160px');
    h.fill('#message-input','');assert.equal(h.find('#message-input').style.height,'56px');
});

test('玩家消息冻结发言时身份，切换后不重署旧消息',()=>{
    const h=historyHarness();
    h.fill('#message-input','现在以旧身份发言');h.click('#send-message');h.click('#stop-message');
    const oldName=h.run('getPersona(currentChat.personaId).name');
    h.run(`commitChat(currentChat,chat=>{chat.personaId='wuxia';});drawMessages()`);
    const rows=h.root.querySelectorAll('.p-msg-user');
    assert.match(rows[0].textContent,/旧记录未标注身份/);
    assert.ok(rows.at(-1).textContent.includes(oldName));
    h.fill('#message-input','新的身份');h.click('#send-message');h.click('#stop-message');
    assert.equal(h.run('currentChat.messages.at(-1).personaSnapshot.name'),'古风女侠');
    const reload=chatHarness(h.storage);
    assert.equal(reload.run('currentChat.messages.at(-2).personaSnapshot.name'),oldName);
});

test('可读快照和上下文保留原文转义，高级JSON默认折叠',()=>{
    const h=chatHarness();h.run(`openContextEditor(currentChat,'snapshot')`);
    assert.match(h.modals.at(-1).body,/性格/);
    assert.equal(h.modals.at(-1).overlay.querySelector('pre'),null);
    h.run('openContextPreview(currentChat)');
    const dialog=h.modals.at(-1);
    assert.match(dialog.body,/手动记忆/);assert.match(dialog.body,/消息 · 1 条/);
    assert.ok(dialog.overlay.querySelector('details'));
    assert.equal(dialog.overlay.querySelectorAll('details[open]').length,0);
});

test('阅读历史时重绘不强制滚到底部',()=>{
    const h=historyHarness(), scroll=h.find('#chat-scroll');
    scroll.scrollHeight=1600;scroll.clientHeight=400;scroll.scrollTop=200;
    let jumped=false;scroll.scrollTo=()=>{jumped=true;};
    h.run('drawMessages()');assert.equal(jumped,false);assert.equal(scroll.scrollTop,200);
});

test('Enter发送、Shift Enter与IME组合输入不触发发送',()=>{
    const h=chatHarness(), count=h.run('currentChat.messages.length');
    h.fill('#message-input','组合输入');
    h.find('#message-input').dispatch('keydown',{key:'Enter',shiftKey:false,isComposing:true});
    h.find('#message-input').dispatch('keydown',{key:'Enter',shiftKey:true,isComposing:false});
    assert.equal(h.run('currentChat.messages.length'),count);
    h.find('#message-input').dispatch('keydown',{key:'Enter',shiftKey:false,isComposing:false});
    assert.equal(h.run('currentChat.messages.length'),count+1);
});

test('草稿读取及写入失败被捕获，发送失败保留输入',()=>{
    const h=chatHarness();h.storage.fail=true;
    assert.doesNotThrow(()=>h.fill('#message-input','重要输入'));
    h.click('#send-message');assert.equal(h.find('#message-input').value,'重要输入');
    assert.match(h.find('#draft-status').textContent,/未保存/);
    h.storage.getItem=()=>{throw new Error('denied');};
    assert.doesNotThrow(()=>h.run('renderChat()'));
    assert.ok(h.toasts.some(([text])=>/无法读取本地草稿/.test(text)));
});

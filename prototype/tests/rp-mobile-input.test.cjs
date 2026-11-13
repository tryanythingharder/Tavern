'use strict';
// Editorial Monocle mobile regression: production closure with DOM/viewport doubles.
// Not browser rendering or real soft-keyboard acceptance.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const directory=path.resolve(__dirname,'..');
const harnessSource=fs.readFileSync(path.join(directory,'rp-state.test.cjs'),'utf8').split('\nfunction createFields(')[0].replace('openModal = captureModal;','globalThis.realOpenModal = openModal; openModal = captureModal;');
const shared={require,__dirname:directory,URL,URLSearchParams,console};
vm.runInNewContext(`${harnessSource}\nglobalThis.sharedHarness={harness};`,shared);
const {harness}=shared.sharedHarness;
function chat(){const h=harness(undefined,'?chat=chat-lin-1');h.run('renderChat()');return h;}

test('visualViewport height/top drives shared budget and restores without discarding the draft or reading offset',()=>{
 const h=chat();h.fill('#message-input','未发送的长草稿');h.find('#message-input').scrollHeight=400;h.find('#chat-scroll').scrollTop=123;
 h.run('window.visualViewport={height:360,offsetTop:42,scale:1};syncVisibleViewport()');
 assert.equal(h.run('document.documentElement.style["--rp-viewport-height"]'),'360px');
 assert.equal(h.run('document.documentElement.style["--rp-viewport-top"]'),'42px');
 assert.equal(h.run('document.documentElement.dataset.rpCompact'),'true');
 assert.equal(h.find('#message-input').style.height,'86.39999999999999px');
 assert.equal(h.find('#chat-scroll').scrollTop,123);
 h.run('window.visualViewport.height=844;window.visualViewport.offsetTop=0;syncVisibleViewport()');
 assert.equal(h.find('#message-input').style.height,'160px');
 assert.equal(h.find('#message-input').value,'未发送的长草稿');
 assert.equal(h.run('document.documentElement.dataset.rpCompact'),'false');
 assert.equal(h.find('#chat-scroll').scrollTop,123);
});

test('layout viewport fallback and pinch zoom do not shrink the composer below its one-line minimum',()=>{
 const h=chat();h.run('window.innerHeight=600;window.visualViewport={height:100,offsetTop:50,scale:2};syncVisibleViewport()');
 assert.equal(h.run('document.documentElement.style["--rp-viewport-height"]'),'600px');
 assert.equal(h.run('document.documentElement.style["--rp-viewport-top"]'),'0px');
 h.run('window.visualViewport=undefined;window.innerHeight=200');
 h.find('#message-input').scrollHeight=400;h.fill('#message-input','长草稿');
 assert.equal(h.find('#message-input').style.height,'56px');
});

test('composition lifecycle blocks Enter and explicit send even when isComposing is missing',()=>{
 const h=chat(),input=h.find('#message-input'),count=h.run('currentChat.messages.length');
 h.fill('#message-input','正在组合');input.dispatch('compositionstart');
 input.dispatch('keydown',{key:'Enter',isComposing:false});h.click('#send-message');h.click('#continue-message');
 assert.equal(h.run('currentChat.messages.length'),count);
 assert.equal(input.value,'正在组合');
 input.dispatch('compositionend');h.click('#send-message');
 assert.equal(h.run('currentChat.messages.length'),count+1);
});

test('IME keyCode 229 and trailing composition-end Enter do not accidentally send',()=>{
 const h=chat(),input=h.find('#message-input'),count=h.run('currentChat.messages.length');h.fill('#message-input','候选确认');
 input.dispatch('keydown',{key:'Enter',keyCode:229,isComposing:false});
 input.dispatch('compositionend');input.dispatch('keydown',{key:'Enter',isComposing:false});
 assert.equal(h.run('currentChat.messages.length'),count);assert.equal(input.value,'候选确认');
 input.dataset.compositionEnded=String(Date.now()-200);input.dispatch('keydown',{key:'Enter',isComposing:false});
 assert.equal(h.run('currentChat.messages.length'),count+1);
});

test('long 300-character URL survives save failure and viewport restoration unchanged',()=>{
 const h=chat(),text='中文\nhttps://example.test/'+ 'a'.repeat(300)+'\n末段';h.fill('#message-input',text);h.storage.fail=true;
 h.run('window.visualViewport={height:360,offsetTop:0,scale:1};syncVisibleViewport()');h.click('#send-message');
 h.run('window.visualViewport.height=844;syncVisibleViewport()');assert.equal(h.find('#message-input').value,text);
 assert.match(h.toasts.at(-1)[0],/失败|保存/);
});

test('real modal nests without losing body styles, inert state, scroll position or trigger focus',()=>{
 const h=chat(),trigger=h.find('#chat-more');trigger.isConnected=true;
 h.run(`document.activeElement=document.querySelector('#chat-more');document.body.style.overflow='auto';window.scrollY=243;window.scrollTo=(x,y)=>{window.restored=[x,y]};globalThis.first=realOpenModal({title:'长设定',body:'<p>内容</p>'});globalThis.second=realOpenModal({title:'子弹窗',body:'<p>编辑</p>'})`);
 assert.equal(h.run('modalStack.length'),2);assert.equal(h.root.style.position,'fixed');assert.equal(h.root.style.top,'-243px');
 h.run('second.close()');assert.equal(h.run('modalStack.length'),1);assert.equal(h.root.style.overflow,'hidden');
 h.run('first.close()');assert.equal(h.root.style.overflow,'auto');assert.equal(h.run('modalStack.length'),0);
 assert.equal(h.run('window.restored[1]'),243);assert.equal(trigger.focused,true);
 assert.equal(h.root.querySelectorAll('.p-modal-root').length,0);
});

test('modal header contains the 44px close control separately from scrolling content',()=>{
 const h=chat();h.run(`realOpenModal({title:'可滚动设定',body:'<p>长内容</p>'})`);
 assert.ok(h.find('.p-modal-head').querySelector('.p-modal-close'));
 assert.equal(h.find('.p-modal-body').querySelector('.p-modal-close'),null);
 h.find('.p-modal-close').click();assert.equal(h.run('modalStack.length'),0);
});

test('Escape closes the production dialog and a delayed focus callback cannot revive it',()=>{
 const h=chat();h.run(`realOpenModal({title:'可退出',body:'<p>内容</p>'})`);
 h.find('.p-modal-root').dispatch('keydown',{key:'Escape'});
 assert.equal(h.run('modalStack.length'),0);assert.doesNotThrow(()=>h.timers.at(-1)());
});

test('dialog Enter shares the composer IME guard and ignores checkbox targets',()=>{
 const h=chat(),count=()=>h.run('globalThis.__confirmCount||0');
 h.run(`globalThis.__confirmCount=0;realOpenModal({title:'输入',body:'<input id="dialog-field"><input id="dialog-check" type="checkbox">',onConfirm:()=>{globalThis.__confirmCount+=1;return false;}})`);
 const field=h.find('#dialog-field');
 field.dispatch('keydown',{key:'Enter',keyCode:229,isComposing:false});
 assert.equal(count(),0);
 field.dispatch('keydown',{key:'Enter',isComposing:true});
 assert.equal(count(),0);
 field.dataset.compositionEnded=String(Date.now());
 field.dispatch('keydown',{key:'Enter',isComposing:false});
 assert.equal(count(),0);
 field.dataset.compositionEnded=String(Date.now()-200);
 field.dispatch('keydown',{key:'Enter',isComposing:false});
 assert.equal(count(),1);
 h.find('#dialog-check').dispatch('keydown',{key:'Enter',isComposing:false});
 assert.equal(count(),1);
});

test('toast region stays interactive while a dialog is open',()=>{
 const h=chat();
 h.run(`globalThis.__region=document.createElement('div');globalThis.__region.className='p-toast-region';document.body.appendChild(globalThis.__region);realOpenModal({title:'弹窗',body:'<p>内容</p>'})`);
 assert.equal(h.run('globalThis.__region.inert === true'),false);
 assert.equal(h.run('modalStack.length'),1);
});

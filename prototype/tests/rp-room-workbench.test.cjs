'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','platform.js'),'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

function setup() {
    const data = new Map();
    const storage = { fail:false, getItem:key => data.get(key) ?? null,
        setItem(key,value) { if(this.fail) throw new Error('quota'); data.set(key,String(value)); },
        removeItem:key => data.delete(key) };
    const root = {dataset:{page:'test'},classList:{toggle(){},add(){},remove(){}},style:{setProperty(){}}};
    const sandbox = {console,URL,URLSearchParams,sessionStorage:storage,localStorage:storage,
        location:{href:'http://localhost/prototype/test.html',search:''},
        matchMedia:()=>({matches:false}),document:{body:root,documentElement:{dataset:{},style:{setProperty(){}}},querySelector:()=>null,querySelectorAll:()=>[]},
        window:{addEventListener(){}},setTimeout,clearTimeout};
    vm.createContext(sandbox);
    vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
        toast = () => {};
        globalThis.run = expression => eval(expression);
    })();`),sandbox);
    return {run:sandbox.run,storage};
}

test('new rooms snapshot member identity independently from current character definitions',()=>{
    const h=setup();
    h.run(`globalThis.room=createRoom('试验房间',['lin-wanzhao','bai-lu']);`);
    const snapshot=h.run(`roomCharacter(room,'lin-wanzhao').name`);
    h.run(`characters['lin-wanzhao'].name='修改后的名称';`);
    assert.equal(h.run(`roomCharacter(room,'lin-wanzhao').name`),snapshot);
    assert.equal(h.run('room.messages.length'),2);
});

test('member changes keep old messages and removed speaker snapshot',()=>{
    const h=setup();
    h.run(`globalThis.room=createRoom('原故事',['lin-wanzhao','bai-lu']);`);
    const before=copy(h.run('room.messages'));
    assert.equal(h.run(`saveRoomConfiguration(room,{name:'新的场次',members:['bai-lu','a-heng'],strategy:'manual',speakerId:'a-heng'})`),true);
    assert.deepEqual(copy(h.run('room.messages')),before);
    assert.equal(h.run(`roomCharacter(room,'lin-wanzhao').name`),'林晚照');
    assert.equal(h.run('room.name'),'新的场次');
});

test('failed room configuration save rolls back title, membership and strategy together',()=>{
    const h=setup();
    h.run(`globalThis.room=createRoom('原故事',['lin-wanzhao','bai-lu']);`);
    const before=copy(h.run('room'));
    h.storage.fail=true;
    assert.equal(h.run(`saveRoomConfiguration(room,{name:'不能保存',members:['bai-lu','a-heng'],strategy:'free',speakerId:'a-heng'})`),false);
    assert.deepEqual(copy(h.run('room')),before);
});

test('invalid membership and manual speaker cannot be saved',()=>{
    const h=setup();
    h.run(`globalThis.room=createRoom('原故事',['lin-wanzhao','bai-lu']);`);
    const before=copy(h.run('room'));
    for(const values of [
        {name:'',members:['lin-wanzhao','bai-lu'],strategy:'free'},
        {name:'坏配置',members:['bai-lu','bai-lu'],strategy:'free'},
        {name:'坏配置',members:['lin-wanzhao','bai-lu'],strategy:'manual',speakerId:'a-heng'},
        {name:'坏配置',members:['lin-wanzhao','bai-lu'],strategy:'invalid'},
    ]) assert.equal(h.run(`saveRoomConfiguration(room,${JSON.stringify(values)})`),false);
    assert.deepEqual(copy(h.run('room')),before);
});

test('specified speaker responds with frozen identity and never impersonates other members',()=>{
    const h=setup();
    h.run(`globalThis.room=createRoom('原故事',['lin-wanzhao','bai-lu']);saveRoomConfiguration(room,{name:room.name,members:room.members,strategy:'manual',speakerId:'lin-wanzhao'});characters['lin-wanzhao'].name='后来改名';`);
    assert.equal(h.run(`sendRoomMessage(room,'我坐在窗边。','lin-wanzhao')`),true);
    const messages=copy(h.run('room.messages.slice(-2)'));
    assert.equal(messages[0].role,'user');
    assert.equal(messages[1].speakerId,'lin-wanzhao');
    assert.match(messages[1].text,/林晚照/);
    assert.doesNotMatch(messages[1].text,/后来改名/);
    assert.equal(messages[1].simulation,true);
});

test('legacy room snapshot initialization is fully rolled back when storage fails',()=>{
    const h=setup();
    h.run(`globalThis.room=rooms[0];delete room.characterSnapshots;`);
    const before=copy(h.run('room'));
    h.storage.fail=true;
    assert.equal(h.run(`saveRoomConfiguration(room,{name:'不能保存',members:room.members,strategy:'free',speakerId:room.members[0]})`),false);
    assert.deepEqual(copy(h.run('room')),before);
    assert.equal(h.run(`sendRoomMessage(room,'不能保存的输入')`),false);
    assert.deepEqual(copy(h.run('room')),before);
});

test('room settings and frozen member definitions survive serialization and reload',()=>{
    const h=setup();
    h.run(`globalThis.room=createRoom('原故事',['lin-wanzhao','bai-lu']);saveRoomConfiguration(room,{name:'已保存的场次',members:room.members,strategy:'free',speakerId:'bai-lu'});`);
    const saved=JSON.parse(h.storage.getItem('rp-platform-state'));
    const room=saved.rooms.find(item=>item.name==='已保存的场次');
    assert.ok(room);
    assert.equal(room.strategy,'free');
    assert.equal(room.characterSnapshots['bai-lu'].name,'白露');
    assert.equal(room.messages.length,2);
    assert.equal(room.count,room.messages.length);
});

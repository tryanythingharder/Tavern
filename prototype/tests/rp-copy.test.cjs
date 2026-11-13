'use strict';
// 模拟边界文案守卫：这些标注是原型诚实性的底线，改动时不能被静默删掉。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const directory = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(directory, file), 'utf8');

test('聊天与房间都标注了本地模拟、不调用模型', () => {
    const source = read('platform.js');
    assert.match(source, /本地模拟 · 模板回复 · 不调用模型/);
    assert.match(source, /不调用模型，不扣点 · 多角色/);
    assert.match(source, /· 模板模拟/);
});

test('上下文预览、采样参数、自动摘要、记忆检索都写明是本地近似', () => {
    const source = read('platform.js');
    assert.match(source, /未发送给真实模型/);
    assert.match(source, /参数不会真正生效/);
    assert.match(source, /本地抽取式摘要 · 非模型总结/);
    assert.match(source, /本地关键词近似，不是向量检索/);
    assert.match(source, /本地关键词判断/);
});

test('点数、支付、账号、设备、举报、评论都有未接入或本地说明', () => {
    const source = read('platform.js');
    assert.match(source, /本地演示：不调用模型、不扣点，数值为示例/);
    assert.match(source, /未连接支付服务/);
    assert.match(source, /未连接真实账号服务/);
    assert.match(source, /静态设备示例/);
    assert.match(source, /只写入本标签页的「举报记录」/);
    assert.match(source, /评论只保存在当前标签页/);
});

test('登录页与后台都有本地原型说明', () => {
    const login = read('login.html');
    assert.match(login, /不会创建真实账号、不保存密码/);
    assert.match(login, /登录不会校验真实账号与密码/);
    assert.match(login, /没有真实账号服务，找回流程不会发送任何请求/);
    const admin = read('admin.html');
    assert.match(admin, /本地演示后台/);
    assert.match(admin, /唯一会真实生效的是「公告」/);
});

// 限流取客户端 IP（lib/rate-limit.ts ipFromHeaders）：默认只认 TCP 对端；TAVERN_TRUSTED_PROXY=1 时取 XFF 最右一跳
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ipFromHeaders, PEER_HEADER, trustedProxy } from '@/lib/rate-limit';

const h = (obj: Record<string, string>) => new Headers(obj);
afterEach(() => { delete process.env.TAVERN_TRUSTED_PROXY; });

test('默认忽略 X-Forwarded-For / X-Real-IP，只用对端地址', () => {
  assert.equal(trustedProxy(), false);
  assert.equal(ipFromHeaders(h({ [PEER_HEADER]: '10.0.0.5', 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' })), '10.0.0.5');
});

test('IPv4 映射的 IPv6 地址去掉 ::ffff: 前缀；纯 IPv6 原样', () => {
  assert.equal(ipFromHeaders(h({ [PEER_HEADER]: '::ffff:127.0.0.1' })), '127.0.0.1');
  assert.equal(ipFromHeaders(h({ [PEER_HEADER]: '::1' })), '::1');
});

test('信任反代时取 XFF 最右一跳（左边可伪造）', () => {
  process.env.TAVERN_TRUSTED_PROXY = '1';
  assert.equal(trustedProxy(), true);
  assert.equal(ipFromHeaders(h({ [PEER_HEADER]: '127.0.0.1', 'x-forwarded-for': '1.1.1.1, 9.9.9.9' })), '9.9.9.9');
  assert.equal(ipFromHeaders(h({ [PEER_HEADER]: '127.0.0.1', 'x-forwarded-for': ' ::ffff:8.8.8.8 ' })), '8.8.8.8');
});

test('信任反代但没有 XFF：退回对端地址', () => {
  process.env.TAVERN_TRUSTED_PROXY = 'true';
  assert.equal(ipFromHeaders(h({ [PEER_HEADER]: '10.1.1.1', 'x-forwarded-for': ' , ' })), '10.1.1.1');
});

test('TAVERN_TRUSTED_PROXY 只认 1/true/yes/on', () => {
  for (const v of ['1', 'TRUE', 'yes', 'on']) { process.env.TAVERN_TRUSTED_PROXY = v; assert.equal(trustedProxy(), true, v); }
  for (const v of ['0', 'false', '', 'enable']) { process.env.TAVERN_TRUSTED_PROXY = v; assert.equal(trustedProxy(), false, v); }
});

test('两样都没有时记为 unknown', () => {
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(ipFromHeaders(h({})), 'unknown'); } finally { console.warn = warn; }
});

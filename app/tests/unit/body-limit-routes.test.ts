// 需登录 JSON 接口的统一请求体上限（第二轮审计 C8）：按路由类型取上限、超限 413、所有 API 路由都不再直接 request.json()
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_LIMITS, jsonLimitFor, readJson, tooLarge } from '@/lib/body-limit';

test('按路由类型取默认上限', () => {
  assert.equal(jsonLimitFor('/api/chats/12/messages'), BODY_LIMITS.json);
  assert.equal(jsonLimitFor('/api/me/prefs'), BODY_LIMITS.json);
  assert.equal(jsonLimitFor('/api/admin/settings'), BODY_LIMITS.json);
  assert.equal(jsonLimitFor('/api/characters/abc/comments'), BODY_LIMITS.json); // 评论不放宽
  assert.equal(jsonLimitFor('/api/characters'), BODY_LIMITS.large); // 建卡：封面/形象以 dataURL 内嵌
  assert.equal(jsonLimitFor('/api/characters/u1-abc'), BODY_LIMITS.large);
  assert.equal(jsonLimitFor('/api/lorebooks/3'), BODY_LIMITS.large);
  assert.equal(jsonLimitFor('/api/presets/3'), BODY_LIMITS.large);
  assert.equal(jsonLimitFor('/api/data-bank'), BODY_LIMITS.large);
  assert.equal(jsonLimitFor('/api/quick-replies/sets/2'), BODY_LIMITS.large);
  assert.equal(jsonLimitFor('/api/chats/import'), BODY_LIMITS.large);
  assert.equal(jsonLimitFor('/api/auth/forgot'), BODY_LIMITS.auth);
  assert.equal(jsonLimitFor('/api/client-error'), BODY_LIMITS.clientError);
  assert.ok(BODY_LIMITS.json >= 512 * 1024 && BODY_LIMITS.json < BODY_LIMITS.large);
});

const big = (n: number) => JSON.stringify({ text: 'x'.repeat(n) });

test('readJson：默认上限内正常解析；坏 JSON / 空体回落 fallback', async () => {
  assert.deepEqual(await readJson(new Request('http://x/api/me/prefs', { method: 'POST', body: '{"a":1}' }), {}), { a: 1 });
  assert.deepEqual(await readJson(new Request('http://x/api/me/prefs', { method: 'POST', body: '{oops' }), { f: 1 }), { f: 1 });
  assert.equal(await readJson(new Request('http://x/api/me/prefs', { method: 'DELETE' }), null), null);
});

test('readJson：Content-Length 超限直接 413；没有长度时边读边数也 413', async () => {
  const declared = new Request('http://x/api/chats/1/messages', { method: 'POST', body: '{}', headers: { 'content-length': String(5 * 1024 * 1024) } });
  const a = await readJson(declared, {});
  assert.ok(a instanceof Response && a.status === 413);
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 3; i += 1) c.enqueue(new Uint8Array(600 * 1024)); c.close(); } });
  const chunked = new Request('http://x/api/me/prefs', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  const b = await readJson(chunked, {});
  assert.ok(b instanceof Response && b.status === 413);
  assert.match(((await (b as Response).json()) as { message: string }).message, /1 MB/);
});

test('readJson：整份文档类路由 2MB 照常解析；显式 limit 优先', async () => {
  const body = big(2 * 1024 * 1024);
  const ok = await readJson(new Request('http://x/api/lorebooks/1', { method: 'PATCH', body }), {});
  assert.ok(!(ok instanceof Response));
  const capped = await readJson(new Request('http://x/api/lorebooks/1', { method: 'PATCH', body }), {}, 1024);
  assert.ok(capped instanceof Response && capped.status === 413);
});

test('413 文案：小上限按 KB 显示（原来 16KB 显示成「0 MB」）', async () => {
  assert.match(((await tooLarge(16 * 1024).json()) as { message: string }).message, /16 KB/);
  assert.match(((await tooLarge(32 * 1024 * 1024).json()) as { message: string }).message, /32 MB/);
});

test('守卫：app/api 下没有路由再直接 request.json()（新路由请用 readJson / jsonOr413）', () => {
  const root = fileURLToPath(new URL('../../app/api', import.meta.url));
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && /\b(request|req)\.json\(\)/.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(root.length));
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

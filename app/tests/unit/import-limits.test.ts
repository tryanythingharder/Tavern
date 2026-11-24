// 导入边界（第二轮审计修复）：PNG iTXt 压缩炸弹解压封顶；JSON 导入请求体上限 413、坏 JSON 回落
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { parsePngCard } from '@/lib/png-card';
import { jsonOr413 } from '@/lib/body-limit';

const chunk = (type: string, data: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length); h.write(type, 4, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([h.subarray(4), data])) >>> 0); return Buffer.concat([h, data, c]); };
const png = (...chunks: Buffer[]) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), ...chunks, chunk('IEND', Buffer.alloc(0))]);
const itxt = (text: Buffer, compressed: boolean) => chunk('iTXt', Buffer.concat([Buffer.from('chara\0'), Buffer.from([compressed ? 1 : 0, 0]), Buffer.from('\0\0'), compressed ? deflateSync(text) : text]));
const b64 = (o: unknown) => Buffer.from(Buffer.from(JSON.stringify(o)).toString('base64'));

test('iTXt 压缩 / 不压缩的卡都能读出', () => {
  assert.deepEqual(parsePngCard(png(itxt(b64({ name: '甲' }), true))), { name: '甲' });
  assert.deepEqual(parsePngCard(png(itxt(b64({ name: '乙' }), false))), { name: '乙' });
});

test('iTXt 压缩炸弹（解出 48MB）被截住（上限 32MB），返回 null', () => {
  // 解开是一张合法的卡（base64 约 48MB）：不封顶就会整份解出并导入成功
  const file = png(itxt(b64({ name: '炸弹', pad: 'A'.repeat(36 * 1024 * 1024) }), true));
  assert.ok(file.length < 1024 * 1024);
  assert.equal(parsePngCard(file), null);
});

test('截断 / 长度字段超界的 PNG 不抛错', () => {
  const ok = png(chunk('tEXt', Buffer.concat([Buffer.from('chara\0'), b64({ name: '丙' })])));
  assert.equal(parsePngCard(ok.subarray(0, 40)), null);
  const bad = Buffer.from(ok); bad.writeUInt32BE(0xffffffff, 8);
  assert.equal(parsePngCard(bad), null);
});

const req = (body: string, headers: Record<string, string> = {}) => new Request('http://x/', { method: 'POST', body, headers });

test('jsonOr413：正常解析；坏 JSON 回落 fallback', async () => {
  assert.deepEqual(await jsonOr413(req('{"a":1}'), 1000, {}), { a: 1 });
  assert.deepEqual(await jsonOr413(req('{oops'), 1000, { f: true }), { f: true });
  assert.equal(await jsonOr413(req(''), 1000, null), null);
});

test('jsonOr413：Content-Length 超限直接 413；无长度时边读边数', async () => {
  const declared = await jsonOr413(req('{}', { 'content-length': '5000' }), 1000, {});
  assert.ok(declared instanceof Response && declared.status === 413);
  const big = 'x'.repeat(5000);
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new TextEncoder().encode(big.slice(i * 1000, (i + 1) * 1000))); c.close(); } });
  const chunked = await jsonOr413(new Request('http://x/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), 1000, {});
  assert.ok(chunked instanceof Response && chunked.status === 413);
});

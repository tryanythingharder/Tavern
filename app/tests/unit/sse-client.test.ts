// lib/sse-client.ts readSse：按空行切事件、跨块拼接、多字节字符被切开、坏 JSON 跳过、非 data 行忽略、残片丢弃
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSse } from '@/lib/sse-client';

const stream = (chunks: (string | Uint8Array)[]) => new ReadableStream<Uint8Array>({
  start(c) { for (const x of chunks) c.enqueue(typeof x === 'string' ? new TextEncoder().encode(x) : x); c.close(); },
});
const collect = async (chunks: (string | Uint8Array)[]) => { const out: unknown[] = []; await readSse(stream(chunks), (e) => out.push(e)); return out; };

test('一个块里多条事件', async () => {
  assert.deepEqual(await collect(['data: {"a":1}\n\ndata: {"a":2}\n\n']), [{ a: 1 }, { a: 2 }]);
});

test('事件跨块切开也能拼回来', async () => {
  assert.deepEqual(await collect(['da', 'ta: {"t', 'ext":"hi"}\n', '\ndata:{"b":2}\n\n']), [{ text: 'hi' }, { b: 2 }]);
});

test('UTF-8 多字节字符被切在两个块之间', async () => {
  const bytes = new TextEncoder().encode('data: {"t":"你好"}\n\n');
  const cut = 12; // 落在「你」的中间
  assert.deepEqual(await collect([bytes.slice(0, cut), bytes.slice(cut)]), [{ t: '你好' }]);
});

test('坏 JSON 跳过，注释行 / event 行忽略', async () => {
  assert.deepEqual(await collect([': ping\n\ndata: {oops}\n\nevent: x\n\ndata: {"ok":true}\n\n']), [{ ok: true }]);
});

test('结尾没以空行收尾的残片丢弃', async () => {
  assert.deepEqual(await collect(['data: {"a":1}\n\ndata: {"a":2}']), [{ a: 1 }]);
});

test('onEvent 抛的错照常往外抛', async () => {
  await assert.rejects(readSse(stream(['data: {"a":1}\n\n']), () => { throw new Error('boom'); }), /boom/);
});

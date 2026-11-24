// lib/zip-read.ts 的上限：文件数、实际解出字节（不信中央目录声明的大小）、store 条目、坏文件
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readZip } from '@/lib/zip-read';

// 手搓一个 zip：entries 里 declared 可以谎报解压后大小
type E = { name: string; data: Buffer; method?: 0 | 8; declared?: number };
function makeZip(entries: E[]): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(e.data) : e.data;
    const name = Buffer.from(e.name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, body);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(e.declared ?? e.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('正常读出 deflate 和 store 条目，跳过目录和 __MACOSX', () => {
  const zip = makeZip([
    { name: 'a.txt', data: Buffer.from('你好'.repeat(100)) },
    { name: 'b.bin', data: Buffer.from([1, 2, 3]), method: 0 },
    { name: 'dir/', data: Buffer.alloc(0), method: 0 },
    { name: '__MACOSX/x', data: Buffer.from('x'), method: 0 },
  ]);
  const out = readZip(zip);
  assert.deepEqual(out.map((e) => e.name), ['a.txt', 'b.bin']);
  assert.equal(out[0].data.toString(), '你好'.repeat(100));
  assert.deepEqual([...out[1].data], [1, 2, 3]);
});

test('文件数上限：超过的条目不读', () => {
  const zip = makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `${i}.txt`, data: Buffer.from(String(i)) })));
  assert.equal(readZip(zip, { files: 3, bytes: 1e6 }).length, 3);
});

test('zip 炸弹：中央目录谎报小尺寸，按实际解出字节卡住', () => {
  const zip = makeZip([{ name: 'bomb', data: Buffer.alloc(2_000_000), declared: 10 }]);
  assert.ok(zip.length < 10_000);
  assert.throws(() => readZip(zip, { files: 10, bytes: 1_000_000 }), /太大/);
});

test('多个条目累计超过上限也会被拦', () => {
  const zip = makeZip([{ name: 'a', data: Buffer.alloc(600) }, { name: 'b', data: Buffer.alloc(600) }]);
  assert.throws(() => readZip(zip, { files: 10, bytes: 1000 }), /太大/);
  assert.equal(readZip(zip, { files: 10, bytes: 1200 }).length, 2);
});

test('store 条目超过剩余额度也拦', () => {
  const zip = makeZip([{ name: 'a', data: Buffer.alloc(2000), method: 0, declared: 1 }]);
  assert.throws(() => readZip(zip, { files: 10, bytes: 1000 }), /太大/);
});

test('不是 zip 时报错', () => {
  assert.throws(() => readZip(Buffer.from('hello world, definitely not a zip file')), /不是有效的 zip/);
});

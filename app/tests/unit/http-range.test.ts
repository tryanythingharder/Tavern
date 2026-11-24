// lib/http-range.ts parseRange（/media 的 Range 支持）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '@/lib/http-range';

test('单段 a-b / a- / -n', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange('bytes=990-5000', 1000), { start: 990, end: 999 });
  assert.deepEqual(parseRange(' Bytes = 1-1 ', 1000), { start: 1, end: 1 });
});

test('取不到 → unsatisfiable（416）', () => {
  for (const h of ['bytes=1000-', 'bytes=5-2', 'bytes=-0', 'bytes=2000-3000']) assert.equal(parseRange(h, 1000), 'unsatisfiable', h);
  assert.equal(parseRange('bytes=0-', 0), 'unsatisfiable');
  assert.equal(parseRange('bytes=-1', 0), 'unsatisfiable');
});

test('没有 / 不认识 / 多段 → null（回整份 200）', () => {
  for (const h of [null, undefined, '', 'items=0-5', 'bytes=abc', 'bytes=-', 'bytes=0-1,5-9', 'bytes=1.5-2']) assert.equal(parseRange(h, 1000), null, String(h));
});

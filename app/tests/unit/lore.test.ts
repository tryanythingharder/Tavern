// 世界书匹配（lib/prompt.ts scanLore）：关键词 / 大小写 / 整词 / 中文 / 正则 / 次要关键词逻辑 / 递归 / 扫描深度 / 预算 / 常驻
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanLore } from '@/lib/prompt';
import type { LoreEntry } from '@/lib/resources';

let seq = 0;
const entry = (over: Partial<LoreEntry>): LoreEntry => ({
  id: `e${(seq += 1)}`, title: over.title ?? `条目${seq}`, keywords: [], secondaryKeywords: [], logic: 'andAny', selective: false,
  text: '内容', enabled: true, constant: false, priority: 100, position: 'before', depth: 4, role: 'system', outletName: '',
  scanDepth: null, caseSensitive: null, matchWholeWords: null, probability: 100, excludeRecursion: false, preventRecursion: false,
  ...over,
} as LoreEntry);
const titles = (r: { entries: LoreEntry[] }) => r.entries.map((e) => e.title).sort();

test('关键词命中 / 不命中；默认不区分大小写', () => {
  const a = entry({ title: 'A', keywords: ['Dragon'] });
  const b = entry({ title: 'B', keywords: ['phoenix'] });
  assert.deepEqual(titles(scanLore([a, b], ['a DRAGON appears'])), ['A']);
});

test('区分大小写（全局或条目覆盖）', () => {
  const a = entry({ title: 'A', keywords: ['Dragon'] });
  assert.deepEqual(titles(scanLore([a], ['a dragon'], { caseSensitive: true })), []);
  const b = entry({ title: 'B', keywords: ['Dragon'], caseSensitive: true });
  assert.deepEqual(titles(scanLore([b], ['a dragon'])), []);
  assert.deepEqual(titles(scanLore([b], ['a Dragon'])), ['B']);
});

test('整词匹配：英文要词边界，中文仍按子串', () => {
  const cat = entry({ title: 'cat', keywords: ['cat'] });
  assert.deepEqual(titles(scanLore([cat], ['concatenate'], { matchWholeWords: true })), []);
  assert.deepEqual(titles(scanLore([cat], ['the cat, sat'], { matchWholeWords: true })), ['cat']);
  assert.deepEqual(titles(scanLore([cat], ['concatenate'], { matchWholeWords: false })), ['cat']);
  const zh = entry({ title: '剑', keywords: ['长剑'] });
  assert.deepEqual(titles(scanLore([zh], ['她拔出长剑来'], { matchWholeWords: true })), ['剑']);
});

test('/正则/ 关键词；写坏的正则不命中也不抛错', () => {
  const re = entry({ title: 're', keywords: ['/drag(o|00)n/i'] });
  assert.deepEqual(titles(scanLore([re], ['DRAG00N'])), ['re']);
  const bad = entry({ title: 'bad', keywords: ['/(unclosed/'] });
  assert.deepEqual(titles(scanLore([bad], ['(unclosed'])), []);
  // y（粘性）标志复用时也要从头匹配
  const sticky = entry({ title: 'y', keywords: ['/a/y'] });
  assert.deepEqual(titles(scanLore([sticky], ['abc'])), ['y']);
});

test('次要关键词逻辑 andAny / andAll / notAny / notAll', () => {
  const mk = (logic: string) => entry({ title: logic, keywords: ['king'], secondaryKeywords: ['crown', 'sword'], selective: true, logic: logic as LoreEntry['logic'] });
  const text = ['the king holds a crown'];
  assert.deepEqual(titles(scanLore([mk('andAny')], text)), ['andAny']);
  assert.deepEqual(titles(scanLore([mk('andAll')], text)), []);
  assert.deepEqual(titles(scanLore([mk('notAny')], text)), []);
  assert.deepEqual(titles(scanLore([mk('notAll')], text)), ['notAll']);
});

test('递归：条目正文里的关键词能触发下一条；preventRecursion / 关闭递归则不会', () => {
  const a = entry({ title: 'A', keywords: ['castle'], text: 'the castle has a dungeon' });
  const b = entry({ title: 'B', keywords: ['dungeon'], text: '地牢' });
  assert.deepEqual(titles(scanLore([a, b], ['a castle'])), ['A', 'B']);
  assert.deepEqual(titles(scanLore([a, b], ['a castle'], { recursive: false })), ['A']);
  const a2 = entry({ title: 'A2', keywords: ['castle'], text: 'dungeon', preventRecursion: true });
  const b2 = entry({ title: 'B2', keywords: ['dungeon'] });
  assert.deepEqual(titles(scanLore([a2, b2], ['castle'])), ['A2']);
});

test('扫描深度只看最近 N 条消息；额外来源（角色设定）总在窗口里', () => {
  const a = entry({ title: 'A', keywords: ['old'] });
  assert.deepEqual(titles(scanLore([a], ['old news', 'x', 'y'], { scanDepth: 2 })), []);
  assert.deepEqual(titles(scanLore([a], ['old news', 'x', 'y'], { scanDepth: 3 })), ['A']);
  assert.deepEqual(titles(scanLore([a], ['x', 'y', 'old 设定'], { scanDepth: 1, messageCount: 2 })), ['A']);
});

test('预算：超预算的条目跳过，常驻条目 / ignoreBudget 不受限；停用的不出现', () => {
  const big = entry({ title: 'big', keywords: ['k'], text: 'x'.repeat(50) });
  const small = entry({ title: 'small', keywords: ['k'], text: 'y'.repeat(5), priority: 50 });
  assert.deepEqual(titles(scanLore([big, small], ['k'], { budget: 10 })), ['small']);
  const constant = entry({ title: 'const', constant: true, text: 'z'.repeat(50) });
  assert.deepEqual(titles(scanLore([constant], ['nothing'], { budget: 10 })), ['const']);
  const off = entry({ title: 'off', keywords: ['k'], enabled: false });
  assert.deepEqual(titles(scanLore([off], ['k'])), []);
});

test('输出顺序按 order（priority）从小到大，hits 记录命中的关键词', () => {
  const hi = entry({ title: 'hi', keywords: ['k'], priority: 200 });
  const lo = entry({ title: 'lo', keywords: ['k'], priority: 10 });
  const r = scanLore([hi, lo], ['k']);
  assert.deepEqual(r.entries.map((e) => e.title), ['lo', 'hi']);
  assert.deepEqual(r.hits.find((h) => h.title === 'hi')?.keys, ['k']);
});

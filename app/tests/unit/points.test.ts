// 计费里的纯函数（lib/points.ts）：价格表解析、规则清洗、分档、单次扣点、展示文案
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRule, parseModelPrices, pointsCost, priceLabel, priceShort, tierPrice } from '@/lib/points';

test('parseModelPrices：a=6,b=3 / JSON / 非法值丢弃 / 保留两位小数', () => {
  assert.deepEqual(parseModelPrices('a=6, b:3;c=1.234\nd=-1,e=x'), { a: 6, b: 3, c: 1.23 });
  assert.deepEqual(parseModelPrices('{"gpt":2.5,"bad":-3,"":1}'), { gpt: 2.5 });
  assert.deepEqual(parseModelPrices('{broken'), {});
  assert.deepEqual(parseModelPrices(''), {});
});

test('normalizeRule：模式默认按量，价格越界返回 null，分档排序去重最多 6 档', () => {
  assert.equal(normalizeRule(null), null);
  assert.equal(normalizeRule({ price: -1 }), null);
  assert.equal(normalizeRule({ price: 100001 }), null);
  assert.deepEqual(normalizeRule({ mode: 'weird', price: 2.345 }), { mode: 'token', price: 2.35, tiers: [] });
  const r = normalizeRule({ mode: 'call', price: 3, tiers: [{ above: 2000, price: 6 }, { above: 1000, price: 4 }, { above: 1000, price: 9 }, { above: 0, price: 1 }, { above: 5, price: -1 }] });
  assert.deepEqual(r, { mode: 'call', price: 3, tiers: [{ above: 1000, price: 4 }, { above: 2000, price: 6 }] });
  const many = normalizeRule({ price: 1, tiers: Array.from({ length: 10 }, (_, i) => ({ above: (i + 1) * 100, price: i })) });
  assert.equal(many?.tiers.length, 6);
});

test('tierPrice：输入 tokens 严格大于 above 才进档，取命中的最高档', () => {
  const rule = { mode: 'token' as const, price: 2, tiers: [{ above: 1000, price: 4 }, { above: 5000, price: 8 }] };
  assert.equal(tierPrice(rule, 1000), 2);
  assert.equal(tierPrice(rule, 1001), 4);
  assert.equal(tierPrice(rule, 9999), 8);
});

test('pointsCost：没配规则用全局单价（默认 2 点/千），不足 1 点按 1 点，负数按 0', () => {
  assert.equal(pointsCost(0, 0, 'no-such-model'), 1);
  assert.equal(pointsCost(400, 100, null), 1); // 500×2/1000 = 1
  assert.equal(pointsCost(1000, 501, null), 4); // 1501×2/1000 = 3.002 → 4
  assert.equal(pointsCost(-50, -50, null), 1);
});

test('priceLabel / priceShort 文案', () => {
  assert.equal(priceLabel({ mode: 'call', price: 3, tiers: [{ above: 272000, price: 6 }] }), '3 点/次 · 超 272K 6 点');
  assert.equal(priceLabel({ mode: 'token', price: 2, tiers: [{ above: 1500, price: 3 }] }), '2 点/千 tokens · 超 1.5K 3 点');
  assert.equal(priceShort({ mode: 'token', price: 2, tiers: [] }), '2 点/千');
  assert.equal(priceShort({ mode: 'call', price: 3, tiers: [{ above: 1, price: 1 }] }), '3 点/次起');
});

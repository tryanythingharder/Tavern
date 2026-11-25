// 粘贴的 JSON 带 BOM（\uFEFF）也能导入（第二轮审计 C5）：parseJsonText 只去开头那一个 BOM；jsonOr413 的整份请求体同样处理
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonOr413, parseJsonText } from '@/lib/body-limit';

test('parseJsonText：开头 BOM 去掉后正常解析；没有 BOM 时行为与 JSON.parse 一致', () => {
  assert.deepEqual(parseJsonText('\uFEFF{"name":"BOM卡"}'), { name: 'BOM卡' });
  assert.deepEqual(parseJsonText('{"a":[1,2]}'), { a: [1, 2] });
  assert.throws(() => JSON.parse('\uFEFF{"a":1}'));
});

test('parseJsonText：只去开头一个；值里的 \\uFEFF 原样保留；两个 BOM 仍报错', () => {
  assert.equal((parseJsonText('\uFEFF{"s":"a\uFEFFb"}') as { s: string }).s, 'a\uFEFFb');
  assert.throws(() => parseJsonText('\uFEFF\uFEFF{}'));
  assert.throws(() => parseJsonText('{oops'));
});

test('jsonOr413：请求体本身以 BOM 开头也能解析', async () => {
  const req = new Request('http://x/', { method: 'POST', body: '\uFEFF{"json":"x"}' });
  assert.deepEqual(await jsonOr413(req, 1000, null), { json: 'x' });
});

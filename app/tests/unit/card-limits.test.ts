// 角色卡字段长度上限（第二轮审计 C6）：超限给出字段名 + 长度 + 上限的 400 提示；种子卡与社区常见长卡不受影响
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_LIMITS, cardLimitError, characterInputLimitError, stCardLimitError } from '@/lib/card-limits';
import { CARD_FIELD_LIMITS } from '@/lib/characters';
import { parseStCharacterCard } from '@/lib/cards-import';
import { BASE_CHARACTERS } from '@/data/characters';
import { PLAZA_SEEDS } from '@/data/plaza-seeds';
import { translate } from '@/lib/i18n/core';

test('20 万字角色名被拒绝（原来悄悄截成 32 字入库）', () => {
  const error = stCardLimitError({ name: '名'.repeat(200000), description: 'd', first_mes: 'f' });
  assert.match(error ?? '', /角色名太长：200000 字/);
});

test('33–64 字的角色名仍可导入，按原逻辑截到 32 字', () => {
  const raw = { name: '超'.repeat(40), description: 'd', first_mes: 'f' };
  assert.equal(stCardLimitError(raw), null);
  assert.equal(parseStCharacterCard(raw)?.name.length, CARD_LIMITS.name);
});

test('V2 卡（data 嵌套）各字段超限都能指出字段', () => {
  const big = (n: number) => 'x'.repeat(n + 1);
  assert.match(stCardLimitError({ data: { name: 'a', first_mes: big(30000) } }) ?? '', /「开场白」太长：30001 字，上限 30000 字/);
  assert.match(stCardLimitError({ data: { name: 'a', description: big(60000) } }) ?? '', /「角色描述」/);
  assert.match(stCardLimitError({ data: { name: 'a', alternate_greetings: ['ok', big(30000)] } }) ?? '', /「备用开场 2」/);
  assert.match(stCardLimitError({ data: { name: 'a', mes_example: big(CARD_FIELD_LIMITS.mesExample) } }) ?? '', /对话示例/);
  assert.match(stCardLimitError({ data: { name: 'a', creator_notes: big(CARD_FIELD_LIMITS.creatorNotes) } }) ?? '', /作者备注/);
  assert.match(stCardLimitError({ name: 'a', personality: big(CARD_FIELD_LIMITS.personality) }) ?? '', /性格/);
});

test('社区常见的长卡（描述 2 万、示例 1.5 万、10 个 3000 字备用开场）照常通过', () => {
  const raw = { spec: 'chara_card_v2', data: { name: '长卡', description: '描'.repeat(20000), first_mes: '开'.repeat(8000), mes_example: '例'.repeat(15000), personality: '性'.repeat(5000), scenario: '景'.repeat(5000), creator_notes: '注'.repeat(4000), system_prompt: '系'.repeat(3000), alternate_greetings: Array.from({ length: 10 }, () => '备'.repeat(3000)), tags: ['奇幻', 'x'.repeat(100)] } };
  assert.equal(stCardLimitError(raw), null);
  const card = parseStCharacterCard(raw)!;
  assert.equal(card.description.length, 20000);
  assert.equal(card.alternateGreetings.length, 10);
  assert.equal(card.tags[1].length, CARD_LIMITS.tag); // 超长标签截到 40 字
});

test('所有种子卡（内置 + 广场 80 张）都在上限内', () => {
  for (const seed of [...BASE_CHARACTERS, ...PLAZA_SEEDS]) {
    const error = characterInputLimitError({ ...seed, card: { creatorNotes: (seed as { creatorNotes?: string }).creatorNotes ?? '' } });
    assert.equal(error, null, `${seed.id}: ${error}`);
  }
});

test('编辑器提交：备用开场「---」分隔文本 / 数组都检查', () => {
  assert.match(characterInputLimitError({ name: 'a', alternateGreetings: `短\n---\n${'y'.repeat(30001)}` }) ?? '', /备用开场 2/);
  assert.match(characterInputLimitError({ name: 'a', alternateGreetings: [{ title: 't', text: 'z'.repeat(30001) }] }) ?? '', /备用开场 1/);
  assert.equal(characterInputLimitError({ name: '正常', greeting: '你好', description: '描述', card: { personality: '嘴硬' } }), null);
  assert.equal(cardLimitError({}), null);
});

test('报错文案有英文', () => {
  const en = JSON.parse(readFileSync(new URL('../../lib/i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;
  for (const message of [
    stCardLimitError({ name: '名'.repeat(100) })!,
    stCardLimitError({ name: 'a', first_mes: 'x'.repeat(30001) })!,
    stCardLimitError({ name: 'a', scenario: 'x'.repeat(20001) })!,
    stCardLimitError({ name: 'a', alternate_greetings: ['x'.repeat(30001)] })!,
  ]) assert.ok(!/[\u4e00-\u9fff]/.test(translate(message, en)), `${message} → ${translate(message, en)}`);
});

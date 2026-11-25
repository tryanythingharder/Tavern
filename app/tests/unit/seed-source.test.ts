// 种子卡结构化来源（详情页「来源与许可」）：45 张外部改编卡 + 11 张 18+ 授权卡都有 source，原创卡没有；source 与 creatorNotes 一致
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAZA_SEEDS } from '@/data/plaza-seeds';
import { LICENSE_URL } from '@/data/seed-source';
import { seedSourceFor } from '@/lib/seed-credits';

test('外部改编卡都有 source，原创卡没有', () => {
  const withSource = PLAZA_SEEDS.filter((seed) => seed.source);
  assert.equal(withSource.length, 56);
  assert.equal(withSource.filter((seed) => seed.nsfw).length, 11);
  for (const seed of PLAZA_SEEDS) {
    assert.equal(Boolean(seed.source), Boolean(seed.creatorNotes), seed.id);
    if (seed.author === '酒馆编辑部') assert.equal(seed.source, undefined, seed.id);
  }
});

test('source 字段齐全且与 creatorNotes 署名一致', () => {
  for (const seed of PLAZA_SEEDS.filter((s) => s.source)) {
    const src = seed.source!;
    assert.ok(src.author && src.title && /^https:\/\//.test(src.url), seed.id);
    assert.equal(src.licenseUrl, LICENSE_URL[src.license], seed.id);
    assert.equal(src.adapted, true);
    const notes = seed.creatorNotes!;
    assert.ok(notes.includes(src.author) && notes.includes(src.url) && notes.includes(src.license), seed.id);
    assert.equal(notes.includes('以 CC BY-SA 4.0 发布'), src.license === 'CC BY-SA 4.0', seed.id);
  }
});

test('seedSourceFor 只认种子卡（owner_id 为空）', () => {
  assert.equal(seedSourceFor('pei-yu', null)?.license, 'CC BY 4.0');
  assert.equal(seedSourceFor('vaelin-ardent', null)?.license, 'CC BY-SA 4.0');
  assert.equal(seedSourceFor('pei-yu', 7), null);
  assert.equal(seedSourceFor('wen-zhiyu', null), null);
});

test('立绘取自原卡的 14 张：都是许可覆盖原图的外部卡', () => {
  const original = PLAZA_SEEDS.filter((seed) => !seed.nsfw && seed.source?.portrait === 'original').map((seed) => seed.id).sort();
  assert.deepEqual(original, [
    'caleb-moore', 'edmund-harrower', 'frankie-doyle', 'grey-hollow-light', 'huo-yushen', 'nai-fuer', 'nora-ferraz',
    'pei-yu', 'redline-salvage', 'rosalind-vane', 'shen-yan-collector', 'song-zhixia', 'wangu-night-market', 'xuan-jing',
  ]);
  for (const id of original) {
    const src = seedSourceFor(id, null)!;
    assert.equal(src.license, 'CC BY 4.0', id);
    assert.ok(/foreverse-app|inhabitants\/character-kits/.test(src.url), id);
  }
});

test('18+ 授权卡 11 张：都有署名，立绘 0 张取自原卡、11 张 AI 生成（RisuRealm 许可只覆盖提示词）', () => {
  const r18 = PLAZA_SEEDS.filter((seed) => seed.nsfw);
  assert.equal(r18.length, 11);
  for (const seed of r18) {
    const src = seedSourceFor(seed.id, null)!;
    assert.ok(src, seed.id);
    assert.ok(/^https:\/\/realm\.risuai\.net\/character\//.test(src.url), seed.id);
  }
  const original = r18.filter((seed) => seed.source?.portrait === 'original').map((seed) => seed.id).sort();
  assert.deepEqual(original, []);
  const ai = r18.filter((seed) => !seed.source?.portrait).map((seed) => seed.id).sort();
  assert.deepEqual(ai, ['cigenia', 'hayeon', 'jacob-gyllenwald', 'jago-malhotra', 'kol-zennor', 'lee-dohyun', 'maryhub', 'mihkel-rebane', 'park-nieun', 'tinyaan', 'yuna-lee']);
});

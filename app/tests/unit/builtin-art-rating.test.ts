// 内置立绘分级：18+ 种子卡的原图不能放在 public/characters/（静态文件谁都能直链，且 next.config.mjs 会给 public 立绘一年公开缓存）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_CHARACTERS } from '@/data/characters';
import { PLAZA_SEEDS } from '@/data/plaza-seeds';

// 测试运行时 cwd 在临时目录，按本文件位置找 app 根目录
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

test('18+ 内置卡立绘都在 private/characters/，不在 public/characters/', () => {
  const adult = [...BASE_CHARACTERS, ...PLAZA_SEEDS].filter((character) => character.nsfw).map((character) => character.id);
  assert.ok(adult.length > 0);
  assert.ok(exists('public/characters'), '找不到 public/characters');
  for (const id of adult) assert.equal(exists(`public/characters/${id}.jpg`), false, `${id} 的原图在 public/ 里`);
});

test('public/characters/ 与 private/characters/ 没有同名立绘', () => {
  const publicArt = new Set(fs.readdirSync(path.join(ROOT, 'public/characters')));
  const privateArt = fs.readdirSync(path.join(ROOT, 'private/characters')).filter((file) => file.endsWith('.jpg'));
  for (const file of privateArt) assert.equal(publicArt.has(file), false, file);
});

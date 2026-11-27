// lib/cover-url.ts：封面原图 / 缩略图 / srcset 地址
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ART_VERSION, THUMB_VERSION, builtinArtUrl, coverOriginalUrl, coverSrcSet, coverThumbUrl, thumbOf } from '@/lib/cover-url';
import { NARROW_THUMBS } from '@/lib/thumb-widths';

test('内置卡：原图 /characters/<id>.jpg?v=N，缩略图 /characters/t/<id>.webp?v=N', () => {
  const c = { id: 'lin-wanzhao', ownerId: null, coverImage: null };
  assert.equal(coverOriginalUrl(c), `/characters/lin-wanzhao.jpg?v=${ART_VERSION}`);
  assert.equal(builtinArtUrl('lin-wanzhao'), `/characters/lin-wanzhao.jpg?v=${ART_VERSION}`);
  assert.equal(coverThumbUrl(c), `/characters/t/lin-wanzhao.webp?v=${THUMB_VERSION}`);
  // 不带版本号的旧地址也认得出来
  assert.equal(thumbOf('/characters/lin-wanzhao.jpg'), `/characters/t/lin-wanzhao.webp?v=${THUMB_VERSION}`);
  assert.equal(thumbOf('/characters/lin-wanzhao.jpg?v=7'), `/characters/t/lin-wanzhao.webp?v=${THUMB_VERSION}`);
});

test('上传封面：缩略图走 /media/<name>?w=480；外链和已带参数的原样返回', () => {
  assert.equal(thumbOf('/media/0b4c-11ef.png'), '/media/0b4c-11ef.png?w=480');
  assert.equal(thumbOf('/media/0b4c-11ef.webp'), '/media/0b4c-11ef.webp?w=480');
  assert.equal(thumbOf('/media/0b4c-11ef.mp3'), '/media/0b4c-11ef.mp3');
  assert.equal(thumbOf('/media/0b4c-11ef.png?w=480'), '/media/0b4c-11ef.png?w=480');
  assert.equal(thumbOf('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  assert.equal(thumbOf(null), null);
  assert.equal(coverThumbUrl({ id: 'x', ownerId: 3, coverImage: '/media/ab-cd.jpg' }), '/media/ab-cd.jpg?w=480');
  assert.equal(coverThumbUrl({ id: 'x', ownerId: 3, coverImage: null }), null);
});

test('srcset：缩略图按真实宽度描述，原图 933w；上传封面不给 srcset', () => {
  assert.equal(coverSrcSet({ id: 'lin-wanzhao', ownerId: null }), `/characters/t/lin-wanzhao.webp?v=${THUMB_VERSION} 480w, /characters/lin-wanzhao.jpg?v=${ART_VERSION} 933w`);
  const [narrow, width] = Object.entries(NARROW_THUMBS)[0] ?? [];
  if (narrow) assert.match(coverSrcSet({ id: narrow, ownerId: null }) ?? '', new RegExp(`\\.webp\\?v=\\d+ ${width}w, `));
  assert.equal(coverSrcSet({ id: 'x', ownerId: 3, coverImage: '/media/ab-cd.jpg' }), null);
});

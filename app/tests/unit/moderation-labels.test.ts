// 举报预览（lib/moderation.ts getReportTarget）：状态用中文标签单独给出，不再把 published / active 原值拼进预览；标签都有英文词条
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import db from '@/lib/db';
import { CHARACTER_STATUS_LABEL, USER_STATUS_LABEL, getReportTarget } from '@/lib/moderation';

const now = Date.now();
const uid = Number(db.prepare('INSERT INTO users (email, password_hash, nickname, created_at) VALUES (?,?,?,?)').run(`ml${now}@t.local`, 'x', '举报测试', now).lastInsertRowid);
db.prepare('INSERT INTO characters (id,name,author,initial,hue,category,tags,nsfw,chats,greeting,hook,description,pace,owner_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(`ml-${now}`, '被举报的卡', '举报测试', '被', 10, '奇幻', '[]', 0, '0', '你好', '一句钩子', '描述', '慢', uid, 'published', now);

test('作品举报：预览不含英文状态，statusLabel 为「已公开」', () => {
  const target = getReportTarget({ targetType: 'character', targetId: `ml-${now}` });
  assert.equal(target.statusLabel, '已公开');
  assert.ok(!/published|pending|archived/.test(target.preview), target.preview);
  assert.ok(target.preview.includes('被举报的卡'));
});

test('用户举报：状态「正常」，封禁后「已封禁」，预览与详情不含 active / banned', () => {
  const a = getReportTarget({ targetType: 'user', targetId: String(uid) });
  assert.equal(a.statusLabel, '正常');
  db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(uid);
  const b = getReportTarget({ targetType: 'user', targetId: String(uid) });
  assert.equal(b.statusLabel, '已封禁');
  for (const t of [a, b]) assert.ok(!/\b(active|banned)\b/.test(t.preview + t.detail), t.preview);
});

test('不存在 / 其他类型的目标 statusLabel 为 null', () => {
  assert.equal(getReportTarget({ targetType: 'character', targetId: 'nope' }).statusLabel, null);
  assert.equal(getReportTarget({ targetType: 'other', targetId: 'x' }).statusLabel, null);
});

test('所有状态标签在 en.json 里都有英文', () => {
  const en = JSON.parse(readFileSync(new URL('../../lib/i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;
  for (const label of [...Object.values(CHARACTER_STATUS_LABEL), ...Object.values(USER_STATUS_LABEL)]) assert.ok(en[label], `缺英文：${label}`);
});

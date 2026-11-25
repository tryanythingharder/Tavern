// 卡密 / 邀请码接入统一列表（lib/admin-query.ts）：服务端搜索、状态筛选、排序、分页；KPI 是全表口径（不再是「最近 100 个」）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '@/lib/db';
import { CODE_LIST, INVITE_LIST, codeStats, inviteStats, parseList, queryCodes, queryInvites } from '@/lib/admin-query';

const now = Date.now();
const admin = Number(db.prepare('INSERT INTO users (email, password_hash, nickname, created_at) VALUES (?,?,?,?)').run(`aq${now}@t.local`, 'x', '发码管理员', now).lastInsertRowid);
const player = Number(db.prepare('INSERT INTO users (email, password_hash, nickname, created_at) VALUES (?,?,?,?)').run(`aqp${now}@t.local`, 'x', '兑码玩家', now).lastInsertRowid);
const insCode = db.prepare('INSERT INTO redeem_codes (code, amount, note, created_by, used_by, used_at, created_at) VALUES (?,?,?,?,?,?,?)');
const insInvite = db.prepare('INSERT INTO invite_codes (code, created_by, note, used_by, created_at, used_at) VALUES (?,?,?,?,?,?)');
// 130 个兑换码：前 40 个已用；第 7 个备注「春节活动」；金额 1..130
for (let i = 1; i <= 130; i += 1) insCode.run(`TAV-${String(i).padStart(4, '0')}`, i, i === 7 ? '春节活动' : '', admin, i <= 40 ? player : null, i <= 40 ? now : null, now - (130 - i) * 1000);
for (let i = 1; i <= 25; i += 1) insInvite.run(`INV${String(i).padStart(3, '0')}`, admin, i === 3 ? '内测群' : '', i <= 5 ? player : null, now - (25 - i) * 1000, i <= 5 ? now : null);

test('兑换码 KPI 全表口径：130 个、未用 90、已用 40（超过原来的 100 上限）', () => {
  const s = codeStats();
  assert.equal(s.total, 130);
  assert.equal(s.unused, 90);
  assert.equal(s.used, 40);
  assert.equal(s.unusedPoints, Array.from({ length: 90 }, (_, k) => k + 41).reduce((a, b) => a + b, 0));
});

test('兑换码分页：默认 20 条/页，第 7 页只有 10 条；越界页码落到最后一页', () => {
  const first = queryCodes(parseList({}, CODE_LIST));
  assert.equal(first.total, 130);
  assert.equal(first.pages, 7);
  assert.equal(first.rows.length, 20);
  assert.equal(first.rows[0].code, 'TAV-0130'); // 默认按 id 倒序
  const last = queryCodes(parseList({ page: '99' }, CODE_LIST));
  assert.equal(last.page, 7);
  assert.equal(last.rows.length, 10);
});

test('兑换码筛选 / 搜索 / 排序都在服务端', () => {
  assert.equal(queryCodes(parseList({ status: 'used' }, CODE_LIST)).total, 40);
  assert.equal(queryCodes(parseList({ status: 'unused', per: '100' }, CODE_LIST)).rows.length, 90);
  const byNote = queryCodes(parseList({ q: '春节' }, CODE_LIST));
  assert.deepEqual(byNote.rows.map((r) => r.code), ['TAV-0007']);
  assert.equal(queryCodes(parseList({ q: 'tav-012' }, CODE_LIST)).total, 10); // 0120–0129；小写也能搜到（码统一大写）
  assert.equal(queryCodes(parseList({ q: '兑码玩家' }, CODE_LIST)).total, 40); // 按使用人
  const cheap = queryCodes(parseList({ sort: 'amount', dir: 'asc' }, CODE_LIST));
  assert.equal(cheap.rows[0].amount, 1);
  assert.equal(cheap.rows[0].usedByName, '兑码玩家');
  assert.equal(cheap.rows[0].createdByName, '发码管理员');
  // 非法参数回落默认
  assert.equal(parseList({ sort: 'x; DROP', status: 'weird' }, CODE_LIST).sort, 'id');
  assert.equal(parseList({ status: 'weird' }, CODE_LIST).f.status, '');
});

test('邀请码：统计、筛选、搜索、分页', () => {
  assert.deepEqual(inviteStats(), { total: 25, unused: 20, used: 5 });
  const all = queryInvites(parseList({}, INVITE_LIST));
  assert.equal(all.pages, 2);
  assert.equal(all.rows[0].code, 'INV025'); // 默认按生成时间倒序
  assert.equal(queryInvites(parseList({ status: 'used' }, INVITE_LIST)).total, 5);
  assert.deepEqual(queryInvites(parseList({ q: '内测' }, INVITE_LIST)).rows.map((r) => r.code), ['INV003']);
  assert.equal(queryInvites(parseList({ page: '2' }, INVITE_LIST)).rows.length, 5);
  assert.equal(queryInvites(parseList({ sort: 'created', dir: 'asc' }, INVITE_LIST)).rows[0].code, 'INV001');
});

// 操作日志（lib/audit.ts）：旧表幂等迁移、敏感字段过滤、卡密末 4 位、筛选、保留期清理、CSV 防公式注入、写失败不抛
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '@/lib/db';
import {
  activityCsv, countActivity, last4, listActivity, logActivity, logAdmin, logLoginFailed, migrateLegacy,
  normalizeAdminAction, parseFilter, retentionDays, sanitizeDetail, sweepActivity,
} from '@/lib/audit';

test('旧 audit_log 迁移幂等：重复执行不重复插入，动作名映射成 admin.*', () => {
  db.prepare('INSERT INTO audit_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)').run(1, '赠点', '用户 #7 +10 点 · 测试', Date.now() - 1000);
  db.prepare('INSERT INTO audit_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)').run(1, 'models.catalog', '3 个模型', Date.now() - 900);
  const first = migrateLegacy();
  const second = migrateLegacy();
  assert.equal(first, 2);
  assert.equal(second, 0);
  const rows = listActivity({ action: 'admin.points.grant' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetType, 'user');
  assert.equal(rows[0].targetId, '7');
  assert.equal(normalizeAdminAction('models.catalog'), 'admin.models.catalog');
});

test('详情过滤：密码 / token / 密钥 / 正文类键一律丢掉，值截断', () => {
  const out = sanitizeDetail({ password: 'hunter2-secret', token: 'tok', apiKey: 'sk-x', content: '聊天正文', code: 'ABCD-1234-WXYZ', reason: 'bad', long: 'x'.repeat(500) });
  assert.ok(!out.includes('hunter2'));
  assert.ok(!out.includes('sk-x'));
  assert.ok(!out.includes('聊天正文'));
  assert.ok(!out.includes('ABCD-1234'));
  assert.ok(out.includes('"reason":"bad"'));
  assert.ok(out.length <= 500);
  assert.equal(last4('TAVERN-CODE-9F3K'), '…9F3K');
  assert.equal(last4('abc'), '****');
});

test('登录失败记下尝试的账号（截断），不记密码；用户筛选能按账号查到', () => {
  logLoginFailed('victim@example.com' + 'y'.repeat(200), 'bad_password');
  const rows = listActivity({ user: 'victim@example.com' });
  assert.equal(rows[0].action, 'auth.login_failed');
  assert.ok(rows[0].targetId.length <= 80);
  assert.equal(rows[0].actorId, null);
});

test('tab 筛选：user 不含管理员操作，admin 只含管理员操作', () => {
  logActivity({ actorId: 42, action: 'character.publish', targetType: 'character', targetId: 'c1', ip: '10.1.2.3', userAgent: 'UA' });
  logAdmin(1, '封禁用户', '用户 #42');
  const user = listActivity({ scope: 'user' });
  const admin = listActivity({ scope: 'admin' });
  assert.ok(user.every((r) => r.actorRole !== 'admin'));
  assert.ok(admin.every((r) => r.actorRole === 'admin'));
  assert.ok(admin.some((r) => r.action === 'admin.user.ban'));
  assert.equal(countActivity({ ip: '10.1.' }), 1);
  assert.ok(listActivity({ action: 'character.*' }).some((r) => r.targetId === 'c1'));
});

test('时间范围按天取整；保留期默认 180 天，过期记录被清理', () => {
  const f = parseFilter({ from: '2026-01-02', to: '2026-01-02' }, 'UTC');
  assert.equal(f.from, Date.UTC(2026, 0, 2));
  assert.equal(f.to, Date.UTC(2026, 0, 3) - 1);
  assert.equal(retentionDays(), 180);
  process.env.TAVERN_AUDIT_RETENTION_DAYS = 'abc';
  assert.equal(retentionDays(), 180);
  process.env.TAVERN_AUDIT_RETENTION_DAYS = '30';
  db.prepare("INSERT INTO activity_log (actor_id, actor_role, action, created_at) VALUES (1, 'user', 'auth.login', ?)").run(Date.now() - 31 * 86400000);
  assert.ok(sweepActivity() >= 1);
  delete process.env.TAVERN_AUDIT_RETENTION_DAYS;
});

test('CSV：BOM、引号转义、公式注入加前缀', () => {
  const csv = activityCsv([{ id: 1, actorId: 1, actorRole: 'user', actorName: '=cmd()', actorEmail: '', action: 'auth.login', actionLabel: '登录成功', targetType: '', targetId: '', ip: '', userAgent: 'a"b', detail: '', createdAt: 0 }], ['h']);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes(`"'=cmd()"`));
  assert.ok(csv.includes('"a""b"'));
});

test('写日志失败不抛异常（只 warn）', () => {
  const warn = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try {
    // action 为 null 触发 NOT NULL 约束之前就被 clip 成 ''，这里用不可序列化的详情制造异常
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.doesNotThrow(() => logActivity({ action: 'x.y', detail: cyclic }));
  } finally {
    console.warn = warn;
  }
  assert.equal(warned, 1);
});

import db from '@/lib/db';
import { notify } from '@/lib/notifications';
import { logAdmin } from '@/lib/audit';

// M4 审核：举报入库 → 后台处理 → 通知举报人；封禁直接改 users.status，被禁账号的会话会失效。
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export type Report = {
  id: number;
  reporterId: number;
  reporterName: string;
  targetType: string;
  targetId: string;
  reason: string;
  note: string;
  status: string;
  createdAt: number;
};

type Row = {
  id: number; reporter_id: number; target_type: string; target_id: string; reason: string; note: string;
  status: string; created_at: number; nickname: string;
};

export type ReportTarget = {
  preview: string;
  detail: string;
  link: string | null;
  characterId: string | null;
  userId: number | null;
  userName: string | null;
};

// 把举报目标解析成可读预览与后台可跳转的链接；解析失败也不影响处理举报。
export function getReportTarget(report: { targetType: string; targetId: string }): ReportTarget {
  const id = report.targetId;
  if (report.targetType === 'character') {
    const row = db.prepare('SELECT name, hook, status, owner_id FROM characters WHERE id = ?').get(id) as
      | { name: string; hook: string; status: string; owner_id: number | null }
      | undefined;
    if (!row) return { preview: '角色已不存在', detail: '', link: null, characterId: null, userId: null, userName: null };
    const owner = row.owner_id
      ? db.prepare('SELECT nickname FROM users WHERE id = ?').get(row.owner_id) as { nickname: string } | undefined
      : undefined;
    return {
      preview: `${row.name} · ${row.status} · ${row.hook.slice(0, 100)}`,
      detail: row.hook,
      link: `/c/${id}`,
      characterId: id,
      userId: row.owner_id,
      userName: owner?.nickname ?? null,
    };
  }
  if (report.targetType === 'message') {
    const row = db.prepare(`
            SELECT m.content, m.role, c.id AS chat_id, c.character_id, ch.name AS character_name
            FROM messages m JOIN chats c ON c.id = m.chat_id LEFT JOIN characters ch ON ch.id = c.character_id
            WHERE m.id = ?
        `).get(id) as { content: string; role: string; chat_id: number; character_id: string; character_name: string | null } | undefined;
    if (!row) return { preview: '消息已删除', detail: '', link: null, characterId: null, userId: null, userName: null };
    return {
      preview: `${row.role === 'user' ? '玩家' : row.character_name ?? '角色'}：${row.content.slice(0, 160)}`,
      detail: row.content,
      link: null,
      characterId: row.character_id,
      userId: null,
      userName: null,
    };
  }
  if (report.targetType === 'comment') {
    const row = db.prepare(`
            SELECT cm.content, cm.character_id, ch.name AS character_name
            FROM comments cm LEFT JOIN characters ch ON ch.id = cm.character_id WHERE cm.id = ?
        `).get(id) as { content: string; character_id: string; character_name: string | null } | undefined;
    if (!row) return { preview: '评论已删除', detail: '', link: null, characterId: null, userId: null, userName: null };
    return {
      preview: `评论 · ${row.character_name ?? '角色'}：${row.content.slice(0, 160)}`,
      detail: row.content,
      link: `/c/${row.character_id}`,
      characterId: row.character_id,
      userId: null,
      userName: null,
    };
  }
  if (report.targetType === 'user') {
    const numeric = Number(id);
    const row = Number.isInteger(numeric) && numeric > 0
      ? db.prepare('SELECT id, nickname, email, status FROM users WHERE id = ?').get(numeric) as { id: number; nickname: string; email: string; status: string } | undefined
      : db.prepare('SELECT id, nickname, email, status FROM users WHERE nickname = ? LIMIT 1').get(id) as { id: number; nickname: string; email: string; status: string } | undefined;
    if (!row) return { preview: '用户已不存在', detail: '', link: null, characterId: null, userId: null, userName: null };
    return {
      preview: `${row.nickname} · ${row.email} · ${row.status}`,
      detail: `${row.nickname} · ${row.email} · ${row.status}`,
      link: `/admin/users/${row.id}`,
      characterId: null,
      userId: row.id,
      userName: row.nickname,
    };
  }
  return { preview: '其他举报', detail: '', link: null, characterId: null, userId: null, userName: null };
}

export function createReport(reporterId: number, targetType: string, targetId: string, reason: string, note: string): number {
  const result = db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, note, status, created_at) VALUES (?,?,?,?,?,?,?)').run(
    reporterId,
    ['character', 'message', 'user', 'comment'].includes(targetType) ? targetType : 'other',
    String(targetId).slice(0, 80),
    String(reason).slice(0, 40) || '其他',
    String(note).slice(0, 500),
    'open',
    Date.now(),
  );
  return Number(result.lastInsertRowid);
}

export function listReports(status: 'open' | 'all' = 'open'): Report[] {
  const where = status === 'open' ? "WHERE r.status = 'open'" : '';
  const rows = db.prepare(`
        SELECT r.*, u.nickname FROM reports r JOIN users u ON u.id = r.reporter_id
        ${where} ORDER BY r.id DESC LIMIT 200
    `).all() as Row[];
  return rows.map((row) => ({
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.nickname,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function openReportCount(): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'open'").get() as { count: number }).count;
}

// 用户自己的举报记录（设置页「安全与隐私」）
export function listReportsByReporter(reporterId: number, limit = 20): Report[] {
  const rows = db.prepare(`
        SELECT r.*, u.nickname FROM reports r JOIN users u ON u.id = r.reporter_id
        WHERE r.reporter_id = ? ORDER BY r.id DESC LIMIT ?
    `).all(reporterId, limit) as Row[];
  return rows.map((row) => ({
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.nickname,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function resolveReport(adminId: number, reportId: number, action: 'resolved' | 'dismissed'): boolean {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as Row | undefined;
  if (!row || row.status !== 'open') return false;
  db.prepare('UPDATE reports SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?').run(action, adminId, Date.now(), reportId);
  notify(row.reporter_id, {
    type: 'moderation',
    title: action === 'resolved' ? '举报已处理' : '举报已驳回',
    body: `你对「${row.reason}」的举报${action === 'resolved' ? '已处理，感谢反馈。' : '经核实暂不处理。'}`,
    link: null,
  });
  logAdmin(adminId, action === 'resolved' ? '处理举报' : '驳回举报', `举报 #${reportId} · ${row.reason}`);
  return true;
}

export function setUserStatus(userId: number, status: 'active' | 'banned'): boolean {
  const changed = db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  if (Number(changed.changes) === 0) return false;
  if (status === 'banned') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    notify(userId, { type: 'moderation', title: '账号已被限制', body: '如有疑问请联系管理员。', link: null });
  }
  return true;
}

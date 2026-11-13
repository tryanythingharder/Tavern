#!/usr/bin/env node
// 生产环境初始化管理员：node scripts/promote-admin.mjs you@example.com
// 直接写数据库 role=admin，避免依赖 TAVERN_ADMIN_EMAILS 的未验证邮箱兜底。
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const email = String(process.argv[2] ?? '').trim().toLowerCase();
if (!email) {
  console.error('用法: node scripts/promote-admin.mjs <email>');
  process.exit(1);
}

const db = new DatabaseSync(join(process.cwd(), '.data', 'tavern.db'));
const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
if (!user) {
  console.error(`找不到账号：${email}。请先注册并完成邮箱验证。`);
  process.exit(1);
}
db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
console.log(`已设为管理员：${user.email} (#${user.id})`);

import db from '@/lib/db';

// 运行时配置：管理页写入 app_settings，读取时优先数据库，其次环境变量。
// 密钥类字段只在服务端读；管理接口只返回「是否已配置」。
export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value?.trim() ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
        INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, Date.now());
}

export function hasSetting(key: string): boolean {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return Boolean(row?.value?.trim());
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

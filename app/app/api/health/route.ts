import db from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/health —— 反向代理/进程守护用的存活与数据库就绪探针。
// 不返回配置细节或密钥，避免向公网暴露部署信息。
export async function GET() {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return Response.json(
      { ok: true, db: 'ok', uptime: Math.round(process.uptime()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { ok: false, db: 'error' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

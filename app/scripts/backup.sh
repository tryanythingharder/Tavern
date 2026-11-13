#!/usr/bin/env bash
# 每日备份：SQLite 热备份 + 媒体目录打包。建议 cron 每天 03:00 执行。
# 备份含数据库密钥配置，务必放在受限目录并做异地加密存储。
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/.data/tavern.db"
OUT="$ROOT/.backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT"

if [ ! -f "$DB" ]; then
  echo "数据库不存在：$DB" >&2
  exit 1
fi

# sqlite3 .backup 是热备份，不会阻塞正常读写
sqlite3 "$DB" ".backup '$OUT/tavern-$STAMP.db'"
gzip -f "$OUT/tavern-$STAMP.db"

if [ -d "$ROOT/.data/media" ]; then
  tar -czf "$OUT/media-$STAMP.tar.gz" -C "$ROOT/.data" media
fi

# 只保留 14 天；正式环境请同步到对象存储/异地
find "$OUT" -type f -mtime +14 -delete

echo "备份完成：$OUT/tavern-$STAMP.db.gz"

#!/usr/bin/env bash
# 本地/CI 最小检查：生产构建 + 启动后跑只读生产探针。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build
npx next start -p 3101 > /tmp/tavern-check.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:3101/api/health > /dev/null; then
    break
  fi
  sleep 1
done

PROBE_BASE=http://127.0.0.1:3101 node scripts/production-probe.mjs

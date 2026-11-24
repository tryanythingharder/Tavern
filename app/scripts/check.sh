#!/usr/bin/env bash
# 本地/CI 检查：单元测试（node:test，不需要服务）→ 生产构建 → 起模拟上游 + 独立数据目录的 next start → 只读生产探针 + 对话回归（不耗真实 token）
#
# 环境变量：
#   CHECK_PORT=3101        检查用的端口
#   MOCK_PORT=4010         模拟上游端口；已有模拟上游在跑就复用，否则自己起一个、结束时关掉
#   CHECK_SKIP_BUILD=1     跳过 npm run build（已经构建过时）
#
# 服务跑在临时目录里（软链 .next / node_modules / public），数据库是全新的 <临时目录>/.data，
# 不读 .env.local、不碰开发库；模型地址强制指向模拟上游。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${CHECK_PORT:-3101}"
MOCK_PORT="${MOCK_PORT:-4010}"

# 单元测试：纯函数（世界书匹配、限流取 IP、zip 上限、SSE 解析、计费、Range），几秒跑完，先跑省得白等构建
npm test

if [ "${CHECK_SKIP_BUILD:-0}" != "1" ]; then
  npm run build
fi

RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tavern-check.XXXXXX")"
for item in .next node_modules public package.json next.config.mjs; do
  ln -s "$ROOT/$item" "$RUN_DIR/$item"
done

MOCK_PID=""
LAUNCH_PID=""

# 找监听本端口的 next-server 进程：npx / npm exec 起的话 $! 只是外壳，next-server 才是真正占端口的进程
server_pids() {
  if command -v lsof > /dev/null 2>&1; then
    lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
  elif [ -d /proc ]; then
    for pid in $(pgrep -f '^next-server' 2>/dev/null || true); do
      if [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$RUN_DIR" ]; then echo "$pid"; fi
    done
  fi
}

stop_server() {
  local pids
  pids="$(server_pids)"
  if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi
  if [ -n "$LAUNCH_PID" ]; then kill "$LAUNCH_PID" 2>/dev/null || true; fi
  for _ in $(seq 1 20); do
    [ -z "$(server_pids)" ] && break
    sleep 0.5
  done
}

cleanup() {
  stop_server
  if [ -n "$MOCK_PID" ]; then kill "$MOCK_PID" 2>/dev/null || true; fi
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT

if [ -n "$(server_pids)" ]; then
  echo "端口 $PORT 已被占用，换一个 CHECK_PORT 再试" >&2
  exit 1
fi

# 模拟上游
if curl -sf "http://127.0.0.1:$MOCK_PORT/v1/models" 2>/dev/null | grep -q mock-model; then
  echo "复用已在运行的模拟上游 :$MOCK_PORT"
else
  MOCK_PORT="$MOCK_PORT" node scripts/regress/mock-upstream.mjs > "$RUN_DIR/mock.log" 2>&1 &
  MOCK_PID=$!
  for _ in $(seq 1 20); do
    curl -sf "http://127.0.0.1:$MOCK_PORT/v1/models" > /dev/null 2>&1 && break
    sleep 0.5
  done
fi

(
  cd "$RUN_DIR"
  exec env \
    NEXT_PUBLIC_SITE_URL="http://127.0.0.1:$PORT" \
    TAVERN_MODEL_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
    TAVERN_MODEL_API_KEY=sk-mock \
    TAVERN_MODEL_NAME=mock-model \
    TAVERN_ADMIN_EMAILS=admin@test.local \
    TAVERN_DAILY_TOKEN_CAP=0 \
    TAVERN_RATE_PER_MIN=1000 \
    TAVERN_TIMEZONE=UTC \
    "$ROOT/node_modules/.bin/next" start -p "$PORT"
) > "$RUN_DIR/server.log" 2>&1 &
LAUNCH_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null; then
    break
  fi
  sleep 1
done
if ! curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null; then
  echo "服务没起来：" >&2
  tail -n 40 "$RUN_DIR/server.log" >&2
  exit 1
fi

PROBE_BASE="http://127.0.0.1:$PORT" node scripts/production-probe.mjs
BASE="http://127.0.0.1:$PORT" APPDIR="$RUN_DIR" node scripts/regress/chat-regress.mjs | grep -v '^\[{'

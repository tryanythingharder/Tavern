import { appendFileSync, renameSync, rmSync, statSync } from 'fs';

// 按大小轮转的追加写日志（第二轮审计 F3：errors.log 原来只追加不轮转）。
// 写入前若「当前大小 + 本行」超过 maxBytes：x.log → x.log.1 → x.log.2 …，最老的（x.log.<keep>）删掉，再写新的 x.log。
// 多进程同时轮转时 rename 可能撞上，失败就忽略：最坏是某次多留 / 少留一个旧文件，不会丢掉正在写的这一行。
export type RotateOptions = { maxBytes: number; keep: number };

export function rotateIfNeeded(file: string, incoming: number, { maxBytes, keep }: RotateOptions): boolean {
  let size = 0;
  try { size = statSync(file).size; } catch { return false; }
  if (size === 0 || size + incoming <= maxBytes) return false;
  if (keep < 1) {
    // 不留旧文件：直接清掉重写
    try { rmSync(file, { force: true }); return true; } catch { return false; }
  }
  try { rmSync(`${file}.${keep}`, { force: true }); } catch { /* 忽略 */ }
  for (let index = keep - 1; index >= 1; index -= 1) {
    try { renameSync(`${file}.${index}`, `${file}.${index + 1}`); } catch { /* 这一档不存在 */ }
  }
  try { renameSync(file, `${file}.1`); } catch { return false; }
  return true;
}

export function appendRotating(file: string, line: string, options: RotateOptions): void {
  rotateIfNeeded(file, Buffer.byteLength(line), options);
  appendFileSync(file, line);
}

const num = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.min(max, parsed) : fallback;
};

/** errors.log 的轮转参数：TAVERN_ERROR_LOG_MB（单文件上限，默认 10MB）、TAVERN_ERROR_LOG_KEEP（保留旧文件个数，默认 5） */
export function errorLogRotation(env: Record<string, string | undefined> = process.env): RotateOptions {
  return {
    maxBytes: Math.round(num(env.TAVERN_ERROR_LOG_MB, 10, 0.01, 1024) * 1024 * 1024),
    keep: Math.floor(num(env.TAVERN_ERROR_LOG_KEEP, 5, 0, 50)),
  };
}

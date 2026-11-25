// errors.log 按大小轮转（第二轮审计 F3）：超过上限滚到 .1/.2…，只保留 keep 个旧文件，最新的一行总在 errors.log
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRotating, errorLogRotation } from '@/lib/log-rotate';
import { reportError } from '@/lib/monitor';

test('超过上限就轮转；旧文件最多 keep 个，.1 比 .2 新', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rot-'));
  const file = join(dir, 'errors.log');
  const line = (i: number) => `${JSON.stringify({ i, pad: 'x'.repeat(80) })}\n`; // 每行约 100 字节
  for (let i = 0; i < 200; i += 1) appendRotating(file, line(i), { maxBytes: 1000, keep: 3 });
  const names = readdirSync(dir).sort();
  assert.deepEqual(names, ['errors.log', 'errors.log.1', 'errors.log.2', 'errors.log.3']);
  for (const name of names) assert.ok(statSync(join(dir, name)).size <= 1000, `${name} 超过上限`);
  const last = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8').trim().split('\n').pop()!).i as number;
  assert.equal(last('errors.log'), 199);
  assert.ok(last('errors.log.1') > last('errors.log.2') && last('errors.log.2') > last('errors.log.3'));
});

test('单行比上限还大也照写（写进新文件），不会死循环或丢行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rot-'));
  const file = join(dir, 'e.log');
  appendRotating(file, 'small\n', { maxBytes: 10, keep: 2 });
  appendRotating(file, `${'y'.repeat(50)}\n`, { maxBytes: 10, keep: 2 });
  assert.equal(readFileSync(file, 'utf8'), `${'y'.repeat(50)}\n`);
  assert.equal(readFileSync(`${file}.1`, 'utf8'), 'small\n');
});

test('keep=0：超限直接清空重写，不留旧文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rot-'));
  const file = join(dir, 'e.log');
  for (let i = 0; i < 5; i += 1) appendRotating(file, '0123456789\n', { maxBytes: 25, keep: 0 });
  assert.deepEqual(readdirSync(dir), ['e.log']);
  assert.ok(statSync(file).size <= 25);
});

test('参数：默认 10MB / 5 个；环境变量可调，非法值回落默认', () => {
  assert.deepEqual(errorLogRotation({}), { maxBytes: 10 * 1024 * 1024, keep: 5 });
  assert.deepEqual(errorLogRotation({ TAVERN_ERROR_LOG_MB: '1', TAVERN_ERROR_LOG_KEEP: '2' }), { maxBytes: 1024 * 1024, keep: 2 });
  assert.deepEqual(errorLogRotation({ TAVERN_ERROR_LOG_MB: 'abc', TAVERN_ERROR_LOG_KEEP: '-1' }), { maxBytes: 10 * 1024 * 1024, keep: 5 });
});

test('reportError 写进 .data/logs/errors.log 并按 TAVERN_ERROR_LOG_MB 轮转', () => {
  process.env.TAVERN_ERROR_LOG_MB = '0.01'; // 约 10KB
  process.env.TAVERN_ERROR_LOG_KEEP = '2';
  const error = console.error;
  console.error = () => {};
  try {
    for (let i = 0; i < 80; i += 1) reportError({ source: 'client', message: `轮转测试 ${i} ${'z'.repeat(300)}`, path: '/x' });
  } finally {
    console.error = error;
    delete process.env.TAVERN_ERROR_LOG_MB;
    delete process.env.TAVERN_ERROR_LOG_KEEP;
  }
  const logs = join(process.cwd(), '.data', 'logs');
  assert.ok(existsSync(join(logs, 'errors.log.2')));
  assert.ok(!existsSync(join(logs, 'errors.log.3')));
  assert.match(readFileSync(join(logs, 'errors.log'), 'utf8'), /轮转测试 79/);
});

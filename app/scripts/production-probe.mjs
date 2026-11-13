#!/usr/bin/env node
// 生产冒烟探针：node scripts/production-probe.mjs
// 只做只读检查，不写数据库、不消耗模型额度。
const base = (process.env.PROBE_BASE ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log('PASS', name, detail ? `(${detail})` : '');
  } catch (error) {
    failed += 1;
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const home = await fetch(base + '/', { redirect: 'manual' });
const headers = home.headers;

await check('首页 200', async () => assert(home.status === 200, `status=${home.status}`));
await check('安全头 CSP/XFO/nosniff', async () => {
  assert(headers.get('content-security-policy'), '缺少 CSP');
  assert(headers.get('x-frame-options') === 'DENY', '缺少 X-Frame-Options');
  assert(headers.get('x-content-type-options') === 'nosniff', '缺少 nosniff');
});
await check('不暴露 X-Powered-By', async () => assert(!headers.get('x-powered-by'), '仍暴露 X-Powered-By'));

await check('健康检查', async () => {
  const response = await fetch(base + '/api/health');
  const body = await response.json();
  assert(response.status === 200 && body.ok === true && body.db === 'ok', JSON.stringify(body));
  return `uptime=${body.uptime}s`;
});

await check('未登录访问导出接口 401', async () => {
  const response = await fetch(base + '/api/me/export', { redirect: 'manual' });
  assert(response.status === 401, `status=${response.status}`);
});

await check('未登录访问后台接口 401', async () => {
  const response = await fetch(base + '/api/admin/settings', { redirect: 'manual' });
  assert(response.status === 401, `status=${response.status}`);
});

await check('未登录访问后台页跳登录', async () => {
  const response = await fetch(base + '/admin', { redirect: 'manual' });
  assert([302, 303, 307, 308].includes(response.status), `status=${response.status}`);
});

await check('未知媒体 404', async () => {
  const response = await fetch(base + '/media/does-not-exist.png', { redirect: 'manual' });
  assert(response.status === 404, `status=${response.status}`);
});

await check('登录页 200', async () => {
  const response = await fetch(base + '/login', { redirect: 'manual' });
  assert(response.status === 200, `status=${response.status}`);
});

console.log(failed ? `\n${failed} 项失败` : '\n生产探针全部通过');
process.exit(failed ? 1 : 0);

// 对话回归：对一个已启动的实例跑端到端检查（注册走真实 server action，生成走模拟上游）
// 先起模拟上游：node scripts/regress/mock-upstream.mjs（端口 4010），.env.local 里 TAVERN_MODEL_BASE_URL=http://127.0.0.1:4010/v1、TAVERN_DAILY_TOKEN_CAP=0
// 用法：BASE=http://127.0.0.1:3100 APPDIR=/path/to/app node chat-regress.mjs
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import http from 'node:http';
import { deflateRawSync } from 'node:zlib';
const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const APPDIR = process.env.APPDIR;
const CHAR = process.env.CHAR || 'lin-wanzhao';
const results = [];
let jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';'); const i = kv.indexOf('=');
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === '') delete jar[k]; else jar[k] = v;
  }
}
async function req(path, opts = {}, useJar = true) {
  const headers = { ...(opts.headers || {}) };
  if (useJar && Object.keys(jar).length) headers.cookie = cookieHeader();
  if (opts.json !== undefined) { headers['content-type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const res = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body, redirect: opts.redirect || 'manual', signal: opts.signal });
  if (useJar) absorb(res);
  return res;
}
async function sse(path, json, abortAfterMs) {
  const ctl = new AbortController();
  const res = await req(path, { method: 'POST', json, signal: ctl.signal });
  if (!res.ok) return { status: res.status, events: [], text: await res.text() };
  const events = []; let buf = '';
  const dec = new TextDecoder();
  if (abortAfterMs) setTimeout(() => ctl.abort(), abortAfterMs);
  try {
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); const d = line.split('\n').find((l) => l.startsWith('data: ')); if (d) { try { events.push(JSON.parse(d.slice(6))); } catch {} } }
    }
  } catch (e) { if (!abortAfterMs) throw e; }
  return { status: res.status, events };
}
const unesc = (v) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// 取页面里带 server action 的 <form>，收集其中隐藏字段（含绑定参数 $ACTION_REF/$ACTION_n:i/$ACTION_KEY）
function actionForms(html) {
  const out = [];
  for (const m of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) {
    if (!m[1].includes('$ACTION_')) continue;
    const fd = new FormData();
    for (const inp of m[1].matchAll(/<input\b[^>]*>/g)) {
      const tag = inp[0];
      const name = tag.match(/name="([^"]*)"/)?.[1]; if (!name || !/type="hidden"/.test(tag)) continue;
      fd.append(unesc(name), unesc(tag.match(/value="([^"]*)"/)?.[1] ?? ''));
    }
    out.push(fd);
  }
  return out;
}
const deltaText = (ev) => ev.filter((e) => e.type === 'delta').map((e) => e.text).join('');
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, ms: Date.now() - t, note: note || '' }); console.log(`✓ ${results.length}. ${name}${note ? ' — ' + note : ''}`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t, note: e.message }); console.log(`✗ ${results.length}. ${name} — ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const email = `regress${Date.now()}@test.local`;
const SPOOF_IP = '203.0.113.77';
const rndIp = () => `198.51.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`;
let chatId, greetingId, userMsgId, botMsgId, branchId;
const messages = async (id = chatId) => (await (await req(`/api/chats/${id}/messages?limit=100`)).json()).messages;

await step('健康探针 /api/health', async () => { const r = await req('/api/health', {}, false); assert(r.status === 200, `status ${r.status}`); });
await step('首页 zh 渲染', async () => { const r = await req('/', { headers: { 'accept-language': 'zh-CN' } }, false); const t = await r.text(); assert(r.status === 200 && /lang="zh/.test(t), `status ${r.status}`); assert(/tavern_lang=zh/.test((r.headers.getSetCookie() || []).join()), '没写语言 cookie'); });
await step('?lang=en 切英文（proxy/middleware 写 cookie 并当次生效）', async () => { const r = await req('/plaza?lang=en', {}, false); const t = await r.text(); assert(r.status === 200, `status ${r.status}`); assert((r.headers.getSetCookie() || []).join().includes('tavern_lang=en'), '没写 en cookie'); assert(/lang="en/.test(t), '页面未切英文'); });
await step('/login?mode=register → 307 /register', async () => { const r = await req('/login?mode=register&x=1', {}, false); assert(r.status === 307, `status ${r.status}`); assert(/\/register\?x=1$/.test(r.headers.get('location')), r.headers.get('location')); });
await step('?ref= 邀请码记 cookie', async () => { const r = await req('/?ref=R-ABC123', {}, false); assert((r.headers.getSetCookie() || []).join().includes('tavern_ref=R-ABC123'), '没记 ref'); });
await step('安全头 CSP / X-Frame-Options', async () => { const r = await req('/plaza', {}, false); assert(r.headers.get('x-frame-options') === 'DENY', 'XFO'); assert(/default-src 'self'/.test(r.headers.get('content-security-policy') || ''), 'CSP'); });
await step('未登录发消息 → 401', async () => { const r = await req('/api/chats/1/messages', { method: 'POST', json: { text: 'hi' } }, false); assert(r.status === 401, `status ${r.status}`); });
await step('注册（真实 server action 表单提交）', async () => {
  jar = {};
  const page = await req('/register');
  const html = await page.text();
  const m = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/);
  assert(m, '注册页没找到 server action 表单');
  const fd = new FormData();
  fd.set(m[1], ''); fd.set('email', email); fd.set('password', 'regress-pass-123'); fd.set('nickname', '回归测试'); fd.set('birth', '1995-05-05'); fd.set('age', 'on');
  // 带一个伪造的 X-Forwarded-For：默认（未开 TAVERN_TRUSTED_PROXY）服务端必须忽略它
  const r = await req('/register', { method: 'POST', body: fd, headers: { origin: BASE, 'x-forwarded-for': SPOOF_IP } });
  assert(r.status === 303 || r.status === 200 || r.status === 307, `status ${r.status}`);
  assert(jar.tavern_session, '没拿到会话 cookie（loc=' + r.headers.get('location') + '）');
  return `→ ${r.headers.get('location') || r.status}`;
});
await step('登录态 /me 渲染', async () => { const r = await req('/me'); assert(r.status === 200, `status ${r.status}`); });
await step('安全#1 伪造 X-Forwarded-For 不进登录记录', async () => { const j = await (await req('/api/me/sessions')).json(); const ips = (j.sessions || []).map((x) => x.ip); assert(ips.length, '没有会话'); assert(!ips.includes(SPOOF_IP), '记录了伪造的 XFF：' + ips.join(',')); return `ip=${ips.join(',')}`; });
await step('安全#1 轮换 X-Forwarded-For 绕不开单账号登录限流', async () => {
  // 注意：会占本机 11 次 login-ip 额度（30 次/15 分钟），同一实例 15 分钟内连跑 3 次会触发 IP 限流
  const victim = `nobody${Date.now()}@test.local`; const seq = [];
  for (let i = 0; i < 11; i++) {
    const page = await req('/login?mode=login', { headers: { 'x-forwarded-for': rndIp() } }, false);
    const m = (await page.text()).match(/name="(\$ACTION_ID_[0-9a-f]+)"/); assert(m, '登录页没有 action');
    const fd = new FormData(); fd.set(m[1], ''); fd.set('email', victim); fd.set('password', 'wrong-' + i); fd.set('agree', 'on');
    const r = await req('/login?mode=login', { method: 'POST', body: fd, headers: { origin: BASE, 'x-forwarded-for': rndIp() } }, false);
    const loc = decodeURIComponent(r.headers.get('location') || r.headers.get('x-action-redirect') || '');
    seq.push(/频繁/.test(loc) ? 'L' : /不对/.test(loc) ? 'w' : '?' + r.status);
  }
  assert(seq.slice(0, 10).every((x) => x === 'w') && seq[10] === 'L', '序列 ' + seq.join(','));
  return seq.join('');
});
await step('开始新故事（server action startStory）', async () => {
  const page = await req(`/c/${CHAR}`);
  const html = await page.text();
  assert(page.status === 200, `角色页 ${page.status}`);
  const forms = actionForms(html);
  assert(forms.length, '角色页没有 server action 表单');
  let ok = false;
  for (const fd of forms) {
    fd.set('openingId', 'default');
    const r = await req(`/c/${CHAR}`, { method: 'POST', body: fd, headers: { origin: BASE } });
    const loc = r.headers.get('location') || r.headers.get('x-action-redirect') || '';
    const mm = loc.match(/\/chats\/(\d+)/);
    if (mm) { chatId = Number(mm[1]); ok = true; break; }
  }
  assert(ok, '没跳到对话页');
  return `chat ${chatId}`;
});
await step('对话页 SSR 渲染含开场白', async () => { const r = await req(`/chats/${chatId}`); const t = await r.text(); assert(r.status === 200, `status ${r.status}`); const ms = await messages(); greetingId = ms[0].id; assert(ms.length === 1 && ms[0].role === 'assistant', '开场白不对'); assert(t.includes(ms[0].content.slice(0, 8).replace(/[<>&"]/g, '')) || t.length > 1000, '页面没有开场白'); });
await step('发送消息：SSE 流式 delta + done', async () => { const s = await sse(`/api/chats/${chatId}/messages`, { text: '你好，第一句' }); assert(s.status === 200, `status ${s.status} ${s.text || ''}`); const d = s.events.find((e) => e.type === 'done'); assert(d, '没有 done：' + JSON.stringify(s.events.slice(-2))); assert(deltaText(s.events).includes('你好，第一句'), '回声不对'); botMsgId = d.messageId; return `${s.events.length} 个事件`; });
await step('消息落库（玩家 + 角色）', async () => { const ms = await messages(); assert(ms.length === 3, `条数 ${ms.length}`); userMsgId = ms[1].id; assert(ms[1].role === 'user' && ms[2].role === 'assistant', '角色顺序'); assert(ms[2].content.includes('回声'), '内容'); });
await step('生成记账：generation_events 有 usage', async () => { if (!APPDIR) return '跳过（无 APPDIR）'; const db = new DatabaseSync(join(APPDIR, '.data/tavern.db'), { readOnly: true }); const row = db.prepare('SELECT * FROM generation_events ORDER BY id DESC LIMIT 1').get(); db.close(); assert(row && row.status === 'done' && row.total_tokens > 0, JSON.stringify(row)); return `status=${row.status}`; });
await step('重新生成：追加候选', async () => { const s = await sse(`/api/messages/${botMsgId}/regenerate`, {}); assert(s.events.some((e) => e.type === 'done'), JSON.stringify(s.events.slice(-1)) + (s.text || '')); const ms = await messages(); const last = ms.at(-1); assert((last.candidates || last.swipes || []).length >= 2 || last.candidateCount >= 2 || JSON.stringify(last).includes('"total":2'), '候选数不足：' + JSON.stringify(last).slice(0, 200)); });
await step('切换候选 index 0', async () => { const r = await req(`/api/messages/${botMsgId}/candidate`, { method: 'POST', json: { index: 0 } }); assert(r.ok, `status ${r.status}`); });
await step('编辑角色消息', async () => { const r = await req(`/api/messages/${botMsgId}`, { method: 'PATCH', json: { content: '编辑后的回复 EDITED' } }); assert(r.ok, `status ${r.status}`); const ms = await messages(); assert(ms.at(-1).content.includes('EDITED'), '没改到'); });
await step('书签切换', async () => { const r = await req(`/api/messages/${userMsgId}`, { method: 'PATCH', json: { bookmark: true } }); assert(r.ok, `status ${r.status}`); const b = await (await req(`/api/chats/${chatId}/search?bookmarks=1`)).json(); assert(JSON.stringify(b).includes('第一句'), '书签列表没有'); });
await step('聊天内搜索', async () => { const r = await req(`/api/chats/${chatId}/search?q=EDITED`); const j = await r.json(); assert(r.ok && JSON.stringify(j).includes('EDITED'), '搜不到'); });
await step('继续生成', async () => { const s = await sse(`/api/messages/${botMsgId}/continue`, {}); assert(s.status === 200, `status ${s.status} ${s.text || ''}`); assert(s.events.some((e) => e.type === 'done'), JSON.stringify(s.events.slice(-1))); });
await step('空输入发送 = 角色接着说', async () => { const s = await sse(`/api/chats/${chatId}/messages`, { text: '' }); assert(s.events.some((e) => e.type === 'done'), (s.text || '') + JSON.stringify(s.events.slice(-1))); const ms = await messages(); assert(ms.at(-1).role === 'assistant' && ms.at(-2).role === 'assistant', '没追加角色消息'); });
await step('删除消息', async () => { const ms = await messages(); const r = await req(`/api/messages/${ms.at(-1).id}`, { method: 'DELETE' }); assert(r.ok, `status ${r.status}`); assert((await messages()).length === ms.length - 1, '没删掉'); });
await step('从消息分支出新会话', async () => { const r = await req(`/api/chats/${chatId}/branch`, { method: 'POST', json: { messageId: userMsgId } }); const j = await r.json(); assert(r.ok, `status ${r.status} ${JSON.stringify(j)}`); branchId = j.chat?.id ?? j.id ?? j.chatId; assert(branchId, JSON.stringify(j)); const ms = await messages(branchId); assert(ms.length === 2, `分支条数 ${ms.length}`); });
await step('会话设定 GET/PATCH', async () => { const g = await req(`/api/chats/${chatId}/settings`); assert(g.ok, `GET ${g.status}`); const p = await req(`/api/chats/${chatId}/settings`, { method: 'PATCH', json: { lorebookIds: null } }); assert(p.ok, `PATCH ${p.status}`); });
let loreId;
await step('世界书：新建并在上下文命中', async () => {
  const c = await req('/api/lorebooks', { method: 'POST', json: { name: '回归世界书' } }); const cj = await c.json(); assert(c.ok, `create ${c.status} ${JSON.stringify(cj)}`); loreId = cj.lorebook?.id ?? cj.id; assert(loreId, JSON.stringify(cj));
  const p = await req(`/api/lorebooks/${loreId}`, { method: 'PATCH', json: { entries: [{ keys: ['钥匙词'], content: 'LORE_SECRET_7', enabled: true }] } }); assert(p.ok, `patch ${p.status} ${await p.text()}`);
  const s = await sse(`/api/chats/${chatId}/messages`, { text: '提到钥匙词了' }); assert(deltaText(s.events).includes('[lore-hit]'), '世界书没注入：' + deltaText(s.events));
});
await step('上下文预览', async () => { const r = await req(`/api/chats/${chatId}/context-preview`); const j = await r.json(); assert(r.ok, `status ${r.status}`); assert(JSON.stringify(j).includes('LORE_SECRET_7') || JSON.stringify(j).length > 200, '预览为空'); });
await step('正则：作用于提示词与页面显示', async () => {
  const c = await req('/api/regex', { method: 'POST', json: { name: '回归正则', find: '回声', replacement: 'ECHO', target: 'assistant', scope: 'both', enabled: true } });
  const t = await c.text(); assert(c.ok, `create ${c.status} ${t}`);
  const p = await (await req(`/api/chats/${chatId}/context-preview`)).text();
  assert(p.includes('ECHO'), '提示词里没替换');
  const h = await (await req(`/chats/${chatId}`)).text();
  assert(h.includes('ECHO'), '页面显示没替换（SSR）');
});
await step('预设：列表/新建', async () => { const l = await req('/api/presets'); assert(l.ok, `list ${l.status}`); const c = await req('/api/presets', { method: 'POST', json: { name: '回归预设' } }); assert(c.ok, `create ${c.status} ${await c.text()}`); });
await step('身份：新建', async () => { const c = await req('/api/personas', { method: 'POST', json: { name: '回归身份', description: '测试' } }); assert(c.ok, `create ${c.status} ${await c.text()}`); });
await step('快捷回复：新建', async () => { const c = await req('/api/quick-replies', { method: 'POST', json: { label: '回归', content: '你好' } }); assert(c.ok, `create ${c.status} ${await c.text()}`); });
await step('记忆/摘要设置读取', async () => { const r = await req(`/api/chats/${chatId}/memory`); assert(r.ok, `status ${r.status}`); });
await step('导出 txt / jsonl', async () => { const a = await req(`/api/chats/${chatId}/export?format=txt`); const at = await a.text(); assert(a.ok && at.includes('第一句'), 'txt'); const b = await req(`/api/chats/${chatId}/export?format=jsonl`); const bt = await b.text(); assert(b.ok && bt.trim().split('\n').length >= 3, 'jsonl'); });
await step('中途中断：保留已生成部分并落库', async () => { const before = (await messages()).length; await sse(`/api/chats/${chatId}/messages`, { text: 'SLOW 慢慢说' }, 1200); await sleep(2500); const ms = await messages(); const last = ms.at(-1); assert(ms.length === before + 2, `条数 ${before}→${ms.length}`); assert(last.role === 'assistant' && /片段\d/.test(last.content), '没保留部分：' + last.content.slice(0, 60)); return `保留 ${last.content.length} 字`; });
await step('上游 500：报错且玩家消息保留', async () => { const s = await sse(`/api/chats/${chatId}/messages`, { text: 'FAIL500 请失败' }); const err = s.events.find((e) => e.type === 'error') || (s.status >= 400 ? { message: s.text } : null); assert(err, '没有 error 事件：' + JSON.stringify(s.events.slice(-2))); const ms = await messages(); assert(ms.some((m) => m.content.includes('FAIL500')), '玩家消息丢了'); });
await step('改标题 / 删除分支会话', async () => { const p = await req(`/api/chats/${branchId}`, { method: 'PATCH', json: { title: '分支改名' } }); assert(p.ok, `patch ${p.status}`); const d = await req(`/api/chats/${branchId}`, { method: 'DELETE' }); assert(d.ok, `delete ${d.status}`); const g = await req(`/api/chats/${branchId}/messages`); assert(g.status === 404, `删后 ${g.status}`); });
// 原始 HTTP 上传：declared 给定时发假的 Content-Length，否则分块传输；一直写到服务端回应或写满 maxBytes
function rawUpload(path, { declared, maxBytes }) {
  return new Promise((resolve) => {
    const u = new URL(BASE + path);
    const headers = { cookie: cookieHeader(), 'content-type': 'multipart/form-data; boundary=x' };
    if (declared) headers['content-length'] = String(declared); else headers['transfer-encoding'] = 'chunked';
    const t0 = Date.now(); let sent = 0; let done = false;
    const rq = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { done = true; resolve({ status: res.status ?? res.statusCode, sent, ms: Date.now() - t0, body: b.slice(0, 80) }); rq.destroy(); }); });
    rq.on('error', (e) => { if (!done) { done = true; resolve({ status: 'ERR ' + e.code, sent, ms: Date.now() - t0 }); } });
    const chunk = Buffer.alloc(1024 * 1024);
    (function pump() { while (!done && sent < maxBytes) { sent += chunk.length; if (!rq.write(chunk)) { rq.once('drain', pump); return; } } if (!done && !declared) rq.end(); })();
    setTimeout(() => { if (!done) { done = true; rq.destroy(); resolve({ status: 'TIMEOUT', sent, ms: Date.now() - t0 }); } }, 20000);
  });
}
await step('安全#2 zip 炸弹（声明大小造假）被拒', async () => {
  const name = Buffer.from('a.png'); const comp = deflateRawSync(Buffer.alloc(100 * 1024 * 1024));
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(1, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(1, 24); cd.writeUInt16LE(name.length, 28);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(46 + name.length, 12); e.writeUInt32LE(30 + name.length + comp.length, 16);
  const fd = new FormData(); fd.append('files', new Blob([Buffer.concat([lh, name, comp, cd, name, e])]), 'bomb.zip');
  const r = await req('/api/backgrounds', { method: 'POST', body: fd }); const t = await r.text();
  assert(r.status === 400 && t.includes('太大'), `status ${r.status} ${t.slice(0, 80)}`);
  return `${comp.length} 字节压缩包 → ${r.status}`;
});
await step('安全#3 上传声明超限 Content-Length → 413（不读完请求体）', async () => {
  const r = await rawUpload('/api/backgrounds', { declared: 200 * 1024 * 1024, maxBytes: 8 * 1024 * 1024 });
  assert(r.status === 413, JSON.stringify(r)); return `已发 ${r.sent >> 20}MB 即 413，${r.ms}ms`;
});
await step('安全#3 分块上传超限 → 413', async () => {
  const r = await rawUpload('/api/me/avatar', { maxBytes: 40 * 1024 * 1024 });
  assert(r.status === 413, JSON.stringify(r)); return `${r.ms}ms`;
});
async function startStory() {
  const html = await (await req(`/c/${CHAR}`)).text();
  for (const fd of actionForms(html)) {
    fd.set('openingId', 'default');
    const r = await req(`/c/${CHAR}`, { method: 'POST', body: fd, headers: { origin: BASE } });
    const mm = (r.headers.get('location') || r.headers.get('x-action-redirect') || '').match(/\/chats\/(\d+)/);
    if (mm) return Number(mm[1]);
  }
  throw new Error('开不了新故事');
}
function userBalance() {
  if (!APPDIR) return null;
  const db = new DatabaseSync(join(APPDIR, '.data/tavern.db'), { readOnly: true });
  const row = db.prepare('SELECT l.balance_after AS b FROM points_ledger l JOIN users u ON u.id = l.user_id WHERE u.email = ? ORDER BY l.id DESC LIMIT 1').get(email);
  db.close(); return row ? row.b : 0;
}
let lockChat, lockMsg;
await step('安全#4 生成中编辑/删除/分支/ops → 409，结束后候选完整', async () => {
  lockChat = await startStory();
  const s0 = await sse(`/api/chats/${lockChat}/messages`, { text: 'SLOW 锁测试' }); lockMsg = s0.events.find((e) => e.type === 'done')?.messageId; assert(lockMsg, '首条 SLOW 没完成');
  const p = sse(`/api/messages/${lockMsg}/regenerate`, {});
  await sleep(800);
  const codes = [
    (await req(`/api/messages/${lockMsg}`, { method: 'DELETE' })).status,
    (await req(`/api/messages/${lockMsg}`, { method: 'PATCH', json: { content: '生成中改' } })).status,
    (await req(`/api/chats/${lockChat}/branch`, { method: 'POST', json: { messageId: lockMsg } })).status,
    (await req(`/api/chats/${lockChat}/ops`, { method: 'POST', json: { op: 'narrate', text: '旁白' } })).status,
  ];
  const bm = (await req(`/api/messages/${lockMsg}`, { method: 'PATCH', json: { bookmark: true } })).status;
  const s = await p; const done = s.events.find((e) => e.type === 'done');
  assert(codes.every((c) => c === 409), '生成中操作状态 ' + codes.join(','));
  assert(bm === 200, '书签应允许 ' + bm);
  assert(done && done.candidateCount === 2, '重新生成结果不对：' + JSON.stringify(s.events.at(-1)).slice(0, 120));
  const last = (await messages(lockChat)).at(-1); assert(last.id === lockMsg && /片段59/.test(last.content), '结果没落库');
  return `del/patch/branch/ops=${codes.join('/')}，书签 ${bm}，扣 ${done.cost}`;
});
await step('安全#4 生成中整个会话被删 → 报错且不扣点', async () => {
  const before = userBalance();
  const p = sse(`/api/messages/${lockMsg}/regenerate`, {});
  await sleep(800);
  const d = await req(`/api/chats/${lockChat}`, { method: 'DELETE' }); assert(d.ok, `删会话 ${d.status}`);
  const s = await p; const err = s.events.find((e) => e.type === 'error'); const done = s.events.find((e) => e.type === 'done');
  assert(!done && err, '应报错：' + JSON.stringify(s.events.at(-1)).slice(0, 120));
  const after = userBalance();
  if (before !== null) assert(after === before, `余额 ${before}→${after}`);
  return `余额 ${before}→${after}`;
});
await step('沙盒路由安全头', async () => { const r = await req('/sandbox/x', {}, false); const csp = r.headers.get('content-security-policy') || ''; assert(/connect-src 'none'/.test(csp), 'sandbox CSP 缺失 status ' + r.status); });
await step('英文界面对话页渲染', async () => { const r = await req(`/chats/${chatId}?lang=en`); const t = await r.text(); assert(r.status === 200 && /lang="en/.test(t), `status ${r.status}`); await req('/?lang=zh'); });

const pass = results.filter((r) => r.ok).length;
console.log(`\n结果：${pass}/${results.length} 通过`);
process.stdout.write(JSON.stringify(results) + '\n');
process.exit(pass === results.length ? 0 : 1);

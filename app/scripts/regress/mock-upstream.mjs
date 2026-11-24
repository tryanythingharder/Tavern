// OpenAI 兼容模拟上游：回显最后一条玩家消息；含 SLOW 时慢速吐字，含 FAIL500 时返回 500
import http from 'node:http';
const port = Number(process.env.MOCK_PORT || 4010);
let calls = 0;
const lastUser = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return String(messages[i].content ?? '');
  return '';
};
http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : {};
  if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'mock-model' }] })); }
  if (req.url.endsWith('/stats')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ calls })); }
  if (req.url.endsWith('/embeddings')) { res.writeHead(404); return res.end('{}'); }
  calls++;
  const user = lastUser(json.messages) || String(json.prompt ?? '');
  const allText = JSON.stringify(json.messages ?? json.prompt ?? '');
  if (user.includes('FAIL500')) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'mock upstream failure' } })); }
  const lore = allText.includes('LORE_SECRET_7') ? ' [lore-hit]' : '';
  const reply = `回声：${user.slice(0, 80)}${lore}。她点点头，继续说下去。`;
  if (!json.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const slow = user.includes('SLOW');
  const pieces = slow ? Array.from({ length: 60 }, (_, i) => `片段${i}。`) : reply.match(/.{1,6}/gsu);
  let closed = false;
  req.on('close', () => { closed = true; });
  res.on('close', () => { closed = true; });
  for (const p of pieces) {
    if (closed) return;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p }, index: 0 }] })}\n\n`);
    await new Promise((r) => setTimeout(r, slow ? 100 : 5));
  }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], usage: { prompt_tokens: 50, completion_tokens: pieces.length, total_tokens: 50 + pieces.length } })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}).listen(port, '127.0.0.1', () => console.log('mock upstream on', port));

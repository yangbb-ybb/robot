const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const PORT = Number(process.env.PORT || 3000);
const recordsFile = path.join(DATA_DIR, 'records.jsonl');
const publicDir = path.join(ROOT, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('请求 JSON 格式不正确')); }
    });
    req.on('error', reject);
  });
}

function appendRecord(type, data) {
  const record = { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), data };
  fs.appendFileSync(recordsFile, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

function serveStatic(req, res) {
  const requested = decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  const target = path.resolve(publicDir, '.' + requested);
  if (!target.startsWith(publicDir)) return sendJson(res, 403, { error: '禁止访问' });
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: '页面或资源不存在' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return sendJson(res, 200, { ok: true, service: 'interactive-assistant-api', time: new Date().toISOString() });
  if (req.method === 'GET' && req.url === '/api/records') {
    const records = fs.existsSync(recordsFile) ? fs.readFileSync(recordsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).slice(-100) : [];
    return sendJson(res, 200, { records });
  }
  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const input = await readBody(req);
      const text = String(input.text || '').trim();
      if (!text) return sendJson(res, 400, { error: '请输入消息' });
      appendRecord('chat_message', { text, source: input.source === 'voice' ? 'voice' : 'text' });
      return sendJson(res, 200, { reply: `我收到了：${text}\n\n当前是项目骨架阶段。接下来可以把这个想法拆成任务并继续实现。`, status: 'received' });
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && req.url === '/api/events') {
    try { const input = await readBody(req); return sendJson(res, 200, { saved: true, record: appendRecord('interaction_event', input) }); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && req.url === '/api/voice/transcribe') return sendJson(res, 501, { enabled: false, message: '语音转文字接口已预留，后续接入识别服务。' });
  if (req.method === 'GET') return serveStatic(req, res);
  return sendJson(res, 404, { error: '接口不存在' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Interactive assistant running at http://127.0.0.1:${PORT}`));

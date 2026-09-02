/**
 * 珍珠生走访工具 · 静态页面服务器（最小实现，零依赖，Node 18+）
 *
 * 部署形态：办公室局域网（如 x96max / Armbian），仅托管前端构建产物 dist/。
 * 分析不再经服务器中转——浏览器本地脱敏 + 三重安全检查后直连 DeepSeek（见 src/analysis/）。
 *
 * 启动：node static-server.mjs（Windows 可双击 start-server.bat）
 */

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitize, parseRecords, summarize, statsHtml, appendUsage, readUsageText } from './usage-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 5000);
const STATIC_DIR = process.env.STATIC_DIR || join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** 只允许静态目录内的文件；路径穿越/盘符一律拒绝 */
function safeStaticPath(pathname) {
  const root = normalize(STATIC_DIR);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const full = normalize(join(root, rel));
  return full === root || full.startsWith(root + sep) ? full : null;
}

function serveStatic(req, res) {
  const requested = safeStaticPath(req.url);
  if (!requested) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let file = requested;
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(STATIC_DIR, 'index.html'); // SPA fallback：未知路径回 index.html
  }
  try {
    const content = readFileSync(file);
    const type = MIME[extname(file)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      // html 不缓存：构建产物更新后用户刷新即拿到新版
      ...(type.startsWith('text/html') ? { 'Cache-Control': 'no-cache' } : {}),
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // 使用统计：上报接口 + 统计页面（逻辑见 usage-core.mjs，白名单计数，无学生数据）
  if (req.method === 'POST' && url.pathname === '/api/usage') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'invalid_json' }));
        return;
      }
      const clean = sanitize(body);
      if (!clean) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'invalid_payload' }));
        return;
      }
      if (!appendUsage(clean)) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'storage_error' }));
        return;
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(statsHtml(summarize(parseRecords(readUsageText()))));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log('珍珠生走访工具 · 静态页面服务器已启动');
  console.log(`  页面: http://localhost:${PORT}/`);
  console.log(`  静态目录: ${STATIC_DIR}${existsSync(STATIC_DIR) ? '' : '（未找到，请先 npm run build）'}`);
  console.log('  分析模式: 浏览器本地脱敏后直连 DeepSeek（本服务不接触任何数据）');
  console.log('========================================');
});

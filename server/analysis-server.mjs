/**
 * 珍珠生走访工具 · 本地分析服务器（最小实现，零依赖，Node 18+）
 *
 * 职责：接收前端脱敏请求（协议 v1.0）→ 调 DeepSeek → 按契约返回响应。
 * 安全红线（与前端一致）：
 *  - API Key 只存在于本文件的环境变量（server/.env），绝不进入前端构建产物
 *  - 模型配置由服务端决定（DEEPSEEK_MODEL），前端不感知模型名
 *  - 日志白名单：requestId / 耗时 / 学生数量 / 成功失败 / 错误类型——
 *    禁止姓名/证件/电话/家庭情况/申请理由/住址/完整 request body
 *  - 不持久化任何请求内容（日志不落盘，仅 stdout）
 *
 * 启动：node analysis-server.mjs（或双击 start-server.bat）
 * 前置：复制 .env.example 为 .env，填入 DEEPSEEK_API_KEY
 */

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------- .env 手工解析（零依赖；.env 只存在于服务端目录） ---------- */

function loadEnv() {
  const envPath = join(__dirname, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 5000);
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const MAX_STUDENTS = 200; // 滥用防御：单次请求学生数上限

/* ---------- 静态页面托管（同源单服务模式：页面与 /api 同一端口） ---------- */

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
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

/* ---------- 服务端提示词（契约 4.5 全部约束，服务端必做） ---------- */

const SYSTEM_PROMPT = `你是「珍珠生走访」项目的面谈准备助手，不是资格审批器。

绝对禁止：输出「通过/不通过/建议资助/建议淘汰/建议重点资助」及任何等价筛选、排序、结论性表述；最终判断权在基金会工作人员。
你只能：分析、总结、核实、提问、建议。

必须遵守：
1. 可追溯：所有分析必须能追溯到学生申请材料；禁止编造材料中不存在的信息；evidence 必须引用材料原文摘录。
2. 事实与推测分离：summary / familySituation / mainDifficultyFactors 只写材料明确说明的事实；推测内容只允许出现在 interviewNotes（须以「推测：」标注）或 informationToVerify。禁止把推测写成事实。
3. 面谈问题 5-8 个：开放式、中性、尊重学生、不带诱导、不预设答案、避免让学生产生「基金会正在审查我」的压力、不重复材料已非常明确的信息。
   正例：「家里现在主要靠什么维持日常开支呢？」「平时上下学是怎么安排的？」
   反例：「你们家是不是很困难？」「你父亲是不是没有劳动能力了？」「家里这么困难，你有什么感受？」
4. 输出格式：严格 JSON（结构见下方 schema），不得输出 markdown 围栏以外的任何内容；简体中文。
5. 逐生分析：students 必须与请求一一对应，studentId 原样回显；学校级归纳不得包含任何学生姓名。
6. null 字段：表示材料未提供，不得臆测填值；可列入 dataQualityIssues 或 informationToVerify。

输出 schema（严格遵循，不要多余字段）：
{
  "version": "1.0",
  "schoolAnalysis": {
    "overview": "全校整体情况概述段落（非空字符串）",
    "studentCount": 12,
    "difficultyPatterns": ["字符串数组"],
    "commonIssues": ["字符串数组"],
    "dataQualityIssues": ["字符串数组"],
    "keyVerificationTopics": ["字符串数组"],
    "interviewSuggestions": ["字符串数组"]
  },
  "students": [
    {
      "studentId": "student-001（原样回显请求中的 id）",
      "summary": "该生材料要点摘要",
      "familySituation": "家庭情况归纳（仅材料明确说明的事实）",
      "mainDifficultyFactors": [
        { "factor": "因素名", "evidence": "材料原文摘录", "importance": "high|medium|low" }
      ],
      "informationToVerify": ["面谈待核实点"],
      "interviewQuestions": ["5-8 个开放式中性问题"],
      "interviewNotes": ["面谈注意事项；推测内容以「推测：」开头"]
    }
  ]
}`;

/* ---------- 日志白名单（7.2：requestId/耗时/学生数/成败/错误类型） ---------- */

function logWhitelist(requestId, studentCount, ms, ok, errType) {
  const line = {
    ts: new Date().toISOString(),
    requestId,
    studentCount,
    durationMs: ms,
    ok,
    ...(errType ? { errorType: errType } : {}),
  };
  console.log(JSON.stringify(line)); // 白名单字段，绝无请求正文
}

/* ---------- 请求防御（服务端不信任调用方：结构级校验） ---------- */

function validateRequest(body) {
  if (!body || typeof body !== 'object') return '请求体必须为 JSON 对象';
  if (body.version !== '1.0') return 'version 必须为 "1.0"';
  if (typeof body.requestId !== 'string' || !body.requestId) return '缺少 requestId';
  if (!Array.isArray(body.students)) return 'students 必须为数组';
  if (body.students.length === 0) return 'students 不能为空';
  if (body.students.length > MAX_STUDENTS) return `students 数量超过上限 ${MAX_STUDENTS}`;
  for (const s of body.students) {
    if (!s || typeof s.id !== 'string' || !s.id) return 'student.id 缺失';
    if (!s.data || typeof s.data !== 'object') return `student ${s.id} 的 data 缺失`;
  }
  return null;
}

/* ---------- DeepSeek 调用（错误透传：HTTP 状态码原样转发，前端七分类生效） ---------- */

async function callDeepSeek(payload) {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      temperature: 0.3, // 走访分析：低随机度保证可追溯、不跑题
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000), // 服务端上限 60s（前端 30s 超时会先报 timeout）
  });
  return res;
}

/* ---------- HTTP 服务（CORS：页面在 ECS、API 在 localhost，允许跨域） ---------- */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(res, status, body, extraHeaders = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === 'POST' && req.url === '/api/analyze') {
    await handleAnalyze(req, res);
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res); // 静态页面（同源模式页面也从本服务加载）
    return;
  }
  send(res, 404, JSON.stringify({ error: 'not_found' }));
});

async function handleAnalyze(req, res) {
  const start = Date.now();
  let requestId = 'unknown';
  try {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
    const body = JSON.parse(raw || '{}');
    requestId = typeof body.requestId === 'string' ? body.requestId : 'unknown';

    if (!API_KEY) {
      logWhitelist(requestId, 0, Date.now() - start, false, 'server_missing_key');
      send(res, 500, JSON.stringify({ error: 'server_not_configured' }));
      return;
    }

    const invalid = validateRequest(body);
    if (invalid) {
      logWhitelist(requestId, 0, Date.now() - start, false, 'bad_request');
      send(res, 400, JSON.stringify({ error: 'bad_request', message: invalid }));
      return;
    }

    const upstream = await callDeepSeek(body);
    const upstreamText = await upstream.text();

    if (!upstream.ok) {
      // 透传上游状态：401/403 → configuration；429 → rate-limited；5xx → server
      logWhitelist(requestId, body.students.length, Date.now() - start, false, `upstream_${upstream.status}`);
      send(res, upstream.status, upstreamText, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }

    const data = JSON.parse(upstreamText);
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content) {
      logWhitelist(requestId, body.students.length, Date.now() - start, false, 'upstream_empty');
      send(res, 502, JSON.stringify({ error: 'upstream_empty' }));
      return;
    }

    logWhitelist(requestId, body.students.length, Date.now() - start, true);
    send(res, 200, content); // 模型文本原样返回；JSON 修复/契约校验由前端执行（4.4 契约职责在前端）
  } catch (e) {
    const errType = e instanceof SyntaxError ? 'bad_json' : e.name === 'TimeoutError' ? 'upstream_timeout' : 'internal';
    logWhitelist(requestId, 0, Date.now() - start, false, errType);
    send(res, 500, JSON.stringify({ error: 'internal' }));
  }
}

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`单服务模式已启动（同源，无跨域）:`);
  console.log(`  页面: http://localhost:${PORT}/`);
  console.log(`  分析: http://localhost:${PORT}/api/analyze`);
  console.log(`  静态目录: ${STATIC_DIR}${existsSync(STATIC_DIR) ? '' : '（未找到，请先 npm run build）'}`);
  console.log(`  模型: ${MODEL} | API Key: ${API_KEY ? '已配置' : '未配置（请在 server/.env 填入 DEEPSEEK_API_KEY）'}`);
  console.log('========================================');
  console.log('日志仅含白名单字段（requestId/耗时/学生数/成败/错误类型），不含任何学生数据。');
});

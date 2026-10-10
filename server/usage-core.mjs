/**
 * 使用情况统计核心逻辑（Node 24+，内置 node:sqlite）——被 static-server.mjs 复用。
 *
 * 职责：
 *  - POST /api/usage   接收前端上报（见 docs/usage-report-api.md），白名单校验后
 *                      写入 SQLite（server/data/usage.db）
 *  - GET  /stats       汇总统计页面（打开次数/上传数/分析数/token 总量/去重用户/每日趋势）
 *
 * 隐私：只持久化前端白名单计数（工具名/版本/随机ID/事件/数字），绝不存储学生数据。
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(ROOT, 'data');
export const DATA_FILE = join(DATA_DIR, 'usage.db');

/** 白名单字段：丢弃上报中任何未知字段（防脏数据/防误存学生数据） */
const EVENT_WHITELIST = new Set([
  'open', 'file_uploaded', 'analysis_succeeded', 'analysis_failed', 'report_downloaded', 'student_search',
]);
const TOP_WHITELIST = ['tool', 'version', 'clientId', 'event', 'occurredAt', 'payload'];
const FORMAT_WHITELIST = new Set(['markdown', 'html', 'pdf']);
const USAGE_WHITELIST = ['apiCalls', 'promptTokens', 'completionTokens', 'cacheHitTokens'];
const CUM_WHITELIST = ['analyses', 'promptTokens', 'completionTokens', 'totalTokens'];

/** 仅提取数字（有限非负），否则丢弃 */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * 白名单清洗：只保留已知字段（嵌套 usage/cumulative 同样只取白名单数字字段）。
 * 非法结构返回 null（不落盘）。
 */
export function sanitize(body) {
  if (typeof body !== 'object' || body === null) return null;
  const event = body.event;
  if (typeof event !== 'string' || !EVENT_WHITELIST.has(event)) return null;
  if (typeof body.clientId !== 'string' || typeof body.occurredAt !== 'string') return null;
  const out = {};
  for (const k of TOP_WHITELIST) {
    if (k === 'payload') continue;
    if (typeof body[k] === 'string') out[k] = body[k];
  }
  const p = body.payload;
  out.payload = {};
  if (typeof p === 'object' && p !== null) {
    if (p.students !== undefined) {
      const n = num(p.students);
      if (n !== undefined) out.payload.students = n;
    }
    if (p.errorCategory !== undefined && typeof p.errorCategory === 'string') {
      out.payload.errorCategory = p.errorCategory;
    }
    if (FORMAT_WHITELIST.has(p.format)) out.payload.format = p.format;
    if (p.usage && typeof p.usage === 'object') {
      const u = {};
      for (const k of USAGE_WHITELIST) {
        const n = num(p.usage[k]);
        if (n !== undefined) u[k] = n;
      }
      if (Object.keys(u).length > 0) out.payload.usage = u;
    }
    if (p.cumulative && typeof p.cumulative === 'object') {
      const c = {};
      for (const k of CUM_WHITELIST) {
        const n = num(p.cumulative[k]);
        if (n !== undefined) c[k] = n;
      }
      if (Object.keys(c).length > 0) out.payload.cumulative = c;
    }
  }
  if (out.tool === undefined || out.version === undefined || out.clientId === undefined) return null;
  return out;
}

/* ── SQLite 存储（node:sqlite / DatabaseSync，Node 24+） ─────────────── */

let db = null;
let dbPath = DATA_FILE;

/** 测试隔离用：切换数据库文件（会关闭当前连接） */
export function setDbPath(p) {
  closeDb();
  dbPath = p;
}

export function closeDb() {
  if (db) {
    try { db.close(); } catch { /* 忽略 */ }
    db = null;
  }
}

function getDb() {
  if (db) return db;
  if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool TEXT NOT NULL,
      version TEXT NOT NULL,
      client_id TEXT NOT NULL,
      event TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      students INTEGER,
      error_category TEXT,
      format TEXT,
      api_calls INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      cache_hit_tokens INTEGER,
      cum_analyses INTEGER,
      cum_prompt_tokens INTEGER,
      cum_completion_tokens INTEGER,
      cum_total_tokens INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_usage_occurred ON usage_events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_usage_event ON usage_events(event);
  `);
  return db;
}

/** 追加一条已清洗的上报记录；失败返回 false（绝不抛错） */
export function appendUsage(clean) {
  try {
    const p = clean.payload ?? {};
    const stmt = getDb().prepare(`
      INSERT INTO usage_events
        (tool, version, client_id, event, occurred_at,
         students, error_category, format,
         api_calls, prompt_tokens, completion_tokens, cache_hit_tokens,
         cum_analyses, cum_prompt_tokens, cum_completion_tokens, cum_total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      clean.tool, clean.version, clean.clientId, clean.event, clean.occurredAt,
      p.students ?? null, p.errorCategory ?? null, p.format ?? null,
      p.usage?.apiCalls ?? null, p.usage?.promptTokens ?? null,
      p.usage?.completionTokens ?? null, p.usage?.cacheHitTokens ?? null,
      p.cumulative?.analyses ?? null, p.cumulative?.promptTokens ?? null,
      p.cumulative?.completionTokens ?? null, p.cumulative?.totalTokens ?? null,
    );
    return true;
  } catch {
    return false;
  }
}

/** 读取全部记录（还原为 { …顶层, payload } 结构，供 summarize 使用） */
export function loadRecords() {
  try {
    const rows = getDb().prepare('SELECT * FROM usage_events ORDER BY id').all();
    return rows.map((r) => {
      const payload = {};
      if (r.students !== null) payload.students = r.students;
      if (r.error_category !== null) payload.errorCategory = r.error_category;
      if (r.format !== null) payload.format = r.format;
      const usage = {};
      if (r.api_calls !== null) usage.apiCalls = r.api_calls;
      if (r.prompt_tokens !== null) usage.promptTokens = r.prompt_tokens;
      if (r.completion_tokens !== null) usage.completionTokens = r.completion_tokens;
      if (r.cache_hit_tokens !== null) usage.cacheHitTokens = r.cache_hit_tokens;
      if (Object.keys(usage).length > 0) payload.usage = usage;
      const cum = {};
      if (r.cum_analyses !== null) cum.analyses = r.cum_analyses;
      if (r.cum_prompt_tokens !== null) cum.promptTokens = r.cum_prompt_tokens;
      if (r.cum_completion_tokens !== null) cum.completionTokens = r.cum_completion_tokens;
      if (r.cum_total_tokens !== null) cum.totalTokens = r.cum_total_tokens;
      if (Object.keys(cum).length > 0) payload.cumulative = cum;
      return {
        tool: r.tool, version: r.version, clientId: r.client_id,
        event: r.event, occurredAt: r.occurred_at, payload,
      };
    });
  } catch {
    return [];
  }
}

/** 汇总统计（纯函数，供 /stats 与测试复用） */
export function summarize(records) {
  let opens = 0, uploads = 0, succeeded = 0, failed = 0;
  let mdDownloads = 0, htmlDownloads = 0, pdfDownloads = 0, searches = 0;
  let promptTokens = 0, completionTokens = 0, cacheHitTokens = 0;
  let totalStudents = 0;
  const clients = new Set();
  const daily = new Map();

  for (const r of records) {
    clients.add(r.clientId);
    const day = typeof r.occurredAt === 'string' ? r.occurredAt.slice(0, 10) : '未知';
    daily.set(day, (daily.get(day) ?? 0) + 1);
    const p = r.payload ?? {};
    if (r.event === 'open') opens += 1;
    else if (r.event === 'file_uploaded') uploads += 1;
    else if (r.event === 'analysis_succeeded') {
      succeeded += 1;
      totalStudents += num(p.students) ?? 0;
      if (p.usage) {
        promptTokens += num(p.usage.promptTokens) ?? 0;
        completionTokens += num(p.usage.completionTokens) ?? 0;
        cacheHitTokens += num(p.usage.cacheHitTokens) ?? 0;
      }
    } else if (r.event === 'analysis_failed') failed += 1;
    else if (r.event === 'report_downloaded') {
      if (p.format === 'html') htmlDownloads += 1;
      else if (p.format === 'pdf') pdfDownloads += 1;
      else mdDownloads += 1;
    } else if (r.event === 'student_search') searches += 1;
  }

  const trend = [...daily.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    opens, uploads, succeeded, failed, totalStudents,
    mdDownloads, htmlDownloads, pdfDownloads, searches,
    promptTokens, completionTokens, cacheHitTokens,
    totalTokens: promptTokens + completionTokens,
    uniqueClients: clients.size,
    records: records.length,
    trend,
  };
}

/* ── 统计页面（内联 HTML：深色玻璃拟态 + 3D 图表，零外部资源） ───────── */

/** HTML 转义：日期等文本来自上报，统一转义防止破坏页面结构 */
function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmt(n) {
  return Number(n).toLocaleString('zh-CN');
}

/**
 * y 轴上限：向上取整到「4 的整数倍」。
 * 这样 4 条网格线对应的刻度值必为整数，且数据量小时曲线不会被过度压扁。
 */
function niceMax(v) {
  const m = Math.max(1, Math.ceil(v));
  if (m <= 4) return 4;
  if (m <= 40) return Math.ceil(m / 4) * 4;
  if (m <= 200) return Math.ceil(m / 20) * 20;
  const mag = 10 ** Math.floor(Math.log10(m) - 1);
  return Math.ceil(m / (mag * 4)) * mag * 4;
}

/** Catmull-Rom → 三次贝塞尔平滑；控制点 y 限制在绘图区内，避免插值过冲出框 */
function smoothPath(pts, top, bottom) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
  const clamp = (y) => Math.max(top, Math.min(bottom, y));
  let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1)
      + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1)
      + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  }
  return d;
}

/** 每日趋势：SVG 平滑面积图（渐变填充 + 发光曲线 + 悬浮读数） */
function trendChart(trend) {
  if (!trend || trend.length === 0) return '<p class="muted">暂无数据</p>';
  const W = 1000, H = 320, PL = 58, PR = 26, PT = 26, PB = 48;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const counts = trend.map((t) => t.count);
  const yMax = niceMax(Math.max(...counts));
  const x = (i) => (trend.length === 1 ? PL + innerW / 2 : PL + (innerW * i) / (trend.length - 1));
  const y = (v) => PT + innerH - (innerH * v) / yMax;
  const pts = trend.map((t, i) => [x(i), y(t.count)]);
  const line = smoothPath(pts, PT, PT + innerH);
  const baseY = PT + innerH;
  const area = line + ' L' + x(trend.length - 1).toFixed(1) + ',' + baseY
    + ' L' + x(0).toFixed(1) + ',' + baseY + ' Z';

  const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const gy = PT + innerH * r;
    const label = Math.round(yMax * (1 - r));
    return '<line class="grid" x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '"/>'
      + '<text class="axis" x="' + (PL - 10) + '" y="' + (gy + 4) + '" text-anchor="end">' + fmt(label) + '</text>';
  }).join('');

  const labelStep = Math.ceil(trend.length / 8);
  const dots = pts.map(([px, py], i) => (
    '<g class="pt">'
    + '<title>' + esc(trend[i].date) + ' · ' + fmt(trend[i].count) + ' 次</title>'
    + '<circle class="halo" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="13"/>'
    + '<circle class="dot" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4.5"/>'
    + '</g>'
  )).join('');
  const xLabels = trend.map((t, i) => (
    i % labelStep === 0 || i === trend.length - 1
      ? '<text class="axis" x="' + x(i).toFixed(1) + '" y="' + (baseY + 26) + '" text-anchor="middle">'
        + esc(t.date.slice(5)) + '</text>'
      : ''
  )).join('');

  const last = pts[pts.length - 1];
  return '<svg class="chart trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
    + 'aria-label="每日使用趋势折线图">'
    + '<defs>'
    + '<linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="#22d3ee" stop-opacity=".55"/>'
    + '<stop offset="55%" stop-color="#6366f1" stop-opacity=".22"/>'
    + '<stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>'
    + '</linearGradient>'
    + '<linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">'
    + '<stop offset="0%" stop-color="#34d399"/><stop offset="50%" stop-color="#22d3ee"/>'
    + '<stop offset="100%" stop-color="#a78bfa"/>'
    + '</linearGradient>'
    + '<filter id="glow" x="-30%" y="-60%" width="160%" height="260%">'
    + '<feGaussianBlur stdDeviation="6" result="b"/><feMerge>'
    + '<feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    + '</defs>'
    + grid
    + '<path class="area" d="' + area + '" fill="url(#areaFill)"/>'
    + '<path class="line" d="' + line + '" fill="none" stroke="url(#lineStroke)" stroke-width="3" filter="url(#glow)"/>'
    + dots
    + '<circle class="dot tip" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="6"/>'
    + xLabels
    + '</svg>';
}

/** 事件分布：等距（斜二测）立方柱，正/顶/侧三面同色不同明度形成立体感 */
function isoBars(items) {
  const W = 520, H = 300, baseY = 232;
  const bw = 58, depthX = 22, depthY = 14, gap = 44, maxH = 150;
  const max = Math.max(1, ...items.map((i) => i.count));
  const n = items.length;
  const totalW = n * bw + (n - 1) * gap;
  const startX = (W - depthX - totalW) / 2;

  const poly = (p) => '<polygon points="' + p.map(([px, py]) => px.toFixed(1) + ',' + py.toFixed(1)).join(' ') + '"/>';

  const bars = items.map((it, i) => {
    const h = Math.max(4, (maxH * it.count) / max);
    const x = startX + i * (bw + gap);
    const y = baseY - h;
    const front = [[x, y], [x + bw, y], [x + bw, baseY], [x, baseY]];
    const top = [[x, y], [x + depthX, y - depthY], [x + bw + depthX, y - depthY], [x + bw, y]];
    const side = [[x + bw, y], [x + bw + depthX, y - depthY], [x + bw + depthX, baseY - depthY], [x + bw, baseY]];
    const cx = x + bw / 2 + depthX / 2;
    return '<g class="bar">'
      + '<polygon class="shadow" points="'
        + (x - 6 + depthX / 2) + ',' + (baseY + depthY / 2) + ' '
        + (x + bw + depthX) + ',' + (baseY - depthY / 2) + ' '
        + (x + bw + depthX + 22) + ',' + (baseY + depthY / 2 - 4) + ' '
        + (x + bw / 2 + depthX) + ',' + (baseY + depthY + 4) + '"/>'
      + '<g fill="' + it.side + '">' + poly(side) + '</g>'
      + '<g fill="' + it.top + '">' + poly(top) + '</g>'
      + '<g fill="url(#bar' + i + ')">' + poly(front) + '</g>'
      + '<text class="barVal" x="' + cx.toFixed(1) + '" y="' + (y - depthY - 12).toFixed(1) + '" text-anchor="middle">'
        + fmt(it.count) + '</text>'
      + '<text class="barLab" x="' + cx.toFixed(1) + '" y="' + (baseY + 30) + '" text-anchor="middle">'
        + esc(it.label) + '</text>'
      + '<title>' + esc(it.label) + ' · ' + fmt(it.count) + ' 次</title>'
      + '</g>';
  }).join('');

  const defs = items.map((it, i) => (
    '<linearGradient id="bar' + i + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="' + it.top + '"/>'
    + '<stop offset="100%" stop-color="' + it.front + '"/>'
    + '</linearGradient>'
  )).join('');

  return '<svg class="chart iso" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="事件类型分布立体柱状图">'
    + '<defs>' + defs + '</defs>' + bars + '</svg>';
}

/** token / 下载等横条：渐变条 + 内阴影，hover 抬升 */
function statBars(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((it) => (
    '<div class="sbar">'
    + '<div class="sbarHead"><span class="sbarLab">' + esc(it.label) + '</span>'
    + '<span class="sbarVal" data-count="' + it.value + '">' + fmt(it.value) + '</span></div>'
    + '<div class="sbarTrack"><div class="sbarFill" style="width:'
    + Math.max(1.5, (100 * it.value) / max).toFixed(1)
    + '%;background:linear-gradient(90deg,' + it.from + ',' + it.to + ')"></div></div>'
    + '</div>'
  )).join('');
}

/**
 * 统计页面（深色玻璃拟态 + 3D 效果 + SVG 图表，零外部资源可直接离线/内网打开）。
 * 只有聚合计数进入本页，不含任何学生数据。
 */
export function statsHtml(s) {
  const metric = (value, label, color, hint) => (
    '<div class="metric" style="--c:' + color + '">'
    + '<div class="metricInner">'
    + '<div class="num" data-count="' + value + '">' + fmt(value) + '</div>'
    + '<div class="lab">' + esc(label) + '</div>'
    + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '')
    + '<span class="sheen"></span>'
    + '</div></div>'
  );

  const cards = [
    metric(s.opens, '工具打开次数', '#22d3ee'),
    metric(s.uploads, '上传表格数', '#38bdf8'),
    metric(s.succeeded, '分析报告数', '#34d399'),
    metric(s.failed, '分析失败次数', '#f87171'),
    metric(s.totalStudents, '累计分析学生数', '#a78bfa'),
    metric(s.totalTokens, 'token 总量', '#fbbf24', '输入 + 输出'),
    metric(s.mdDownloads, 'Markdown 下载', '#c084fc'),
    metric(s.htmlDownloads, 'HTML 下载', '#f472b6'),
    metric(s.pdfDownloads, 'PDF 下载', '#fb923c'),
  ].join('');

  const events = isoBars([
    { label: '打开', count: s.opens, front: '#0e7490', top: '#22d3ee', side: '#083344' },
    { label: '上传', count: s.uploads, front: '#0369a1', top: '#38bdf8', side: '#082f49' },
    { label: '成功', count: s.succeeded, front: '#047857', top: '#34d399', side: '#052e26' },
    { label: '失败', count: s.failed, front: '#b91c1c', top: '#f87171', side: '#450a0a' },
  ]);

  const tokenRows = statBars([
    { label: '输入 token（prompt）', value: s.promptTokens, from: '#22d3ee', to: '#6366f1' },
    { label: '输出 token（completion）', value: s.completionTokens, from: '#34d399', to: '#22d3ee' },
    { label: '缓存命中 token', value: s.cacheHitTokens, from: '#fbbf24', to: '#f472b6' },
  ]);

  const downloadTotal = s.mdDownloads + s.htmlDownloads + s.pdfDownloads;
  const funnel = [
    { label: '上传表格', value: s.uploads, from: '#38bdf8', to: '#6366f1' },
    { label: '完成分析', value: s.succeeded, from: '#34d399', to: '#22d3ee' },
    { label: '下载报告', value: downloadTotal, from: '#c084fc', to: '#f472b6' },
  ];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>使用情况统计</title>
<style>
  :root {
    --bg:#070b18; --panel:rgba(255,255,255,.045); --line:rgba(255,255,255,.09);
    --txt:#e2e8f0; --sub:#94a3b8; --dim:#64748b;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100vh; color:var(--txt); background:var(--bg);
    font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; font-size:14px;
    -webkit-font-smoothing:antialiased; overflow-x:hidden;
  }
  /* 背景：三团缓慢漂移的光晕 + 一层透视网格，营造纵深 */
  .bg { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
  .bg::before {
    content:''; position:absolute; inset:-20%;
    background:
      radial-gradient(38% 42% at 18% 12%, rgba(34,211,238,.20), transparent 62%),
      radial-gradient(34% 38% at 82% 20%, rgba(167,139,250,.20), transparent 62%),
      radial-gradient(40% 44% at 50% 88%, rgba(52,211,153,.14), transparent 64%);
    animation:drift 22s ease-in-out infinite alternate;
  }
  .bg::after {
    content:''; position:absolute; left:-30%; right:-30%; bottom:-40%; height:150%;
    background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
    background-size:64px 64px;
    transform:perspective(560px) rotateX(66deg);
    mask-image:linear-gradient(to top,#000 0%,transparent 66%);
    -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 66%);
  }
  @keyframes drift { from{transform:translate3d(-2%,-1%,0) scale(1)} to{transform:translate3d(2%,2%,0) scale(1.08)} }

  .wrap { position:relative; z-index:1; max-width:1080px; margin:0 auto; padding:38px 18px 72px; }

  header { margin-bottom:26px; }
  h1 {
    margin:0; font-size:26px; font-weight:800; letter-spacing:.5px;
    background:linear-gradient(93deg,#67e8f9 0%,#a78bfa 48%,#34d399 100%);
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
  }
  .sub { margin-top:8px; color:var(--sub); font-size:12.5px; }
  .badge {
    display:inline-flex; align-items:center; gap:6px; margin-top:12px; padding:5px 12px;
    border:1px solid rgba(52,211,153,.32); border-radius:999px;
    background:rgba(52,211,153,.09); color:#6ee7b7; font-size:11.5px;
  }
  .badge i { width:6px; height:6px; border-radius:50%; background:#34d399; box-shadow:0 0 10px #34d399; animation:pulse 2.2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

  /* 卡片：3D 场景 + 指针视角倾斜 + 掠光 */
  .scene { perspective:1100px; perspective-origin:50% 40%; }
  .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:14px; }
  .metric { transform-style:preserve-3d; animation:rise .7s cubic-bezier(.2,.8,.2,1) backwards; }
  .metric:nth-child(1){animation-delay:.02s}.metric:nth-child(2){animation-delay:.06s}
  .metric:nth-child(3){animation-delay:.10s}.metric:nth-child(4){animation-delay:.14s}
  .metric:nth-child(5){animation-delay:.18s}.metric:nth-child(6){animation-delay:.22s}
  .metric:nth-child(7){animation-delay:.26s}.metric:nth-child(8){animation-delay:.30s}
  .metric:nth-child(9){animation-delay:.34s}
  @keyframes rise { from{opacity:0;transform:translateY(22px) rotateX(-16deg)} to{opacity:1;transform:none} }
  .metricInner {
    position:relative; height:100%; padding:20px 14px 16px; border-radius:16px; overflow:hidden;
    border:1px solid var(--line); background:linear-gradient(160deg,rgba(255,255,255,.075),rgba(255,255,255,.025));
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
    box-shadow:0 14px 34px -18px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.10);
    transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateZ(0);
    transform-style:preserve-3d;
    transition:transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s, border-color .35s;
  }
  .metricInner::before {
    content:''; position:absolute; inset:0; border-radius:16px; padding:1px; pointer-events:none;
    background:linear-gradient(140deg,var(--c),transparent 42%,transparent 62%,var(--c));
    mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    mask-composite:exclude; -webkit-mask-composite:xor; opacity:.42; transition:opacity .35s;
  }
  .metricInner:hover {
    transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateZ(26px);
    border-color:rgba(255,255,255,.28);
    border-color:color-mix(in srgb,var(--c) 55%,transparent);
    box-shadow:0 28px 56px -22px rgba(0,0,0,.95), 0 0 30px -10px rgba(255,255,255,.28), inset 0 1px 0 rgba(255,255,255,.16);
    box-shadow:0 28px 56px -22px rgba(0,0,0,.95), 0 0 34px -12px var(--c), inset 0 1px 0 rgba(255,255,255,.16);
  }
  .metricInner:hover::before { opacity:1; }
  .sheen { position:absolute; top:0; left:-60%; width:45%; height:100%; pointer-events:none;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.16),transparent); transition:left .6s ease; }
  .metricInner:hover .sheen { left:120%; }
  .num {
    font-size:31px; font-weight:800; line-height:1.15; letter-spacing:.5px; color:var(--c);
    font-variant-numeric:tabular-nums;
    text-shadow:0 0 22px rgba(255,255,255,.16);
    text-shadow:0 0 26px color-mix(in srgb,var(--c) 45%,transparent);
  }
  .lab { margin-top:7px; font-size:12.5px; color:var(--sub); }
  .hint { margin-top:3px; font-size:11px; color:var(--dim); }

  .panel {
    position:relative; margin-top:26px; padding:22px 22px 18px; border-radius:18px; overflow:hidden;
    border:1px solid var(--line); background:var(--panel);
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
    box-shadow:0 20px 46px -26px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.08);
  }
  .panel::after {
    content:''; position:absolute; top:0; left:8%; right:8%; height:1px;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);
  }
  h2 { margin:0 0 4px; font-size:15px; font-weight:700; color:#f1f5f9; }
  .cap { margin:0 0 16px; font-size:12px; color:var(--dim); }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width:820px) { .grid2 { grid-template-columns:1fr; } }

  svg.chart { display:block; width:100%; height:auto; overflow:visible; }
  svg.trend { aspect-ratio:1000/320; }
  svg.iso { aspect-ratio:520/300; }
  .grid line { stroke:rgba(255,255,255,.08); stroke-width:1; }
  .trend .area { opacity:.95; }
  .trend .dot { fill:#0b1120; stroke:#67e8f9; stroke-width:2.5; transition:fill .2s, stroke-width .2s; }
  .trend .halo { fill:rgba(103,232,249,.20); opacity:0; transition:opacity .2s; }
  .trend .pt:hover .halo { opacity:1; }
  .trend .pt:hover .dot { fill:#fff; stroke-width:3.5; }
  .trend .pt { cursor:default; }
  text { fill:#94a3b8; font-size:12px; font-family:inherit; }
  text.axis { fill:#64748b; font-size:11px; }
  .iso .bar { cursor:default; transition:transform .3s cubic-bezier(.2,.8,.2,1); transform-origin:center bottom; }
  .iso .bar:hover { transform:translateY(-9px); }
  .iso .shadow { fill:rgba(0,0,0,.42); }
  .iso text.barVal { fill:#f1f5f9; font-size:15px; font-weight:700; }
  .iso text.barLab { fill:#94a3b8; font-size:12px; }

  .sbar + .sbar { margin-top:16px; }
  .sbarHead { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px; }
  .sbarLab { font-size:12.5px; color:var(--sub); }
  .sbarVal { font-size:16px; font-weight:700; color:#f1f5f9; font-variant-numeric:tabular-nums; }
  .sbarTrack { height:11px; border-radius:999px; background:rgba(255,255,255,.06); overflow:hidden;
    box-shadow:inset 0 1px 3px rgba(0,0,0,.55); }
  .sbarFill { height:100%; border-radius:999px; box-shadow:0 0 16px -2px currentColor;
    animation:grow 1.1s cubic-bezier(.2,.8,.2,1) backwards; transform-origin:left; }
  @keyframes grow { from{transform:scaleX(0)} to{transform:scaleX(1)} }

  footer { margin-top:30px; color:var(--dim); font-size:11.5px; line-height:1.9; }
  .muted { color:var(--dim); font-size:12.5px; }
  @media (prefers-reduced-motion:reduce) {
    .bg::before,.badge i,.metric,.sbarFill { animation:none !important; }
    .metricInner,.sheen,.iso .bar { transition:none !important; }
  }
</style></head>
<body>
<div class="bg"></div>
<div class="wrap">
  <header>
    <h1>珍珠生走访审核辅助平台 · 使用情况统计</h1>
    <p class="sub">只统计白名单计数（打开 / 上传 / 分析 / 下载 / token），<b>不含任何学生数据</b>。</p>
    <div class="badge"><i></i>数据源：server/data/usage.db · 共 ${fmt(s.records)} 条记录</div>
  </header>

  <div class="scene"><div class="metrics">${cards}</div></div>

  <section class="panel">
    <h2>每日使用趋势</h2>
    <p class="cap">柱/线高度 = 当日发生的全部动作次数（打开、上传、分析、下载各计 1 次），鼠标悬停查看当日读数。</p>
    ${trendChart(s.trend)}
  </section>

  <div class="grid2">
    <section class="panel">
      <h2>事件类型分布</h2>
      <p class="cap">上传 ${fmt(s.uploads)} 份 vs 分析 ${fmt(s.succeeded)} 份 —— 差异即「上传后未继续分析」的流失。</p>
      ${events}
    </section>
    <section class="panel">
      <h2>token 用量明细</h2>
      <p class="cap">仅统计 AI 调用的输入 / 输出 / 缓存命中 token。</p>
      ${tokenRows}
    </section>
  </div>

  <section class="panel">
    <h2>使用漏斗</h2>
    <p class="cap">上传 → 分析 → 下载，逐级转化率一目了然。</p>
    ${statBars(funnel)}
  </section>

  <footer>
    数据文件：server/data/usage.db（SQLite）· 页面零外部资源，离线可用 · ${esc(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))} 生成
  </footer>
</div>
<script>
(function () {
  // 数字滚动（0 值直接跳过动画）
  var nums = document.querySelectorAll('[data-count]');
  Array.prototype.forEach.call(nums, function (el) {
    var target = Number(el.getAttribute('data-count')) || 0;
    if (!target) return;
    var start = null, dur = 1100;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * e).toLocaleString('zh-CN');
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });

  // 卡片 3D 指针倾斜
  var cards = document.querySelectorAll('.metric');
  Array.prototype.forEach.call(cards, function (c) {
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      c.firstElementChild.style.setProperty('--ry', (px * 16).toFixed(2) + 'deg');
      c.firstElementChild.style.setProperty('--rx', (-py * 13).toFixed(2) + 'deg');
    });
    c.addEventListener('pointerleave', function () {
      c.firstElementChild.style.setProperty('--ry', '0deg');
      c.firstElementChild.style.setProperty('--rx', '0deg');
    });
  });
})();
</script>
</body></html>`;
}

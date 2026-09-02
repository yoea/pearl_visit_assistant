/**
 * 使用情况统计核心逻辑（零依赖，Node 18+）——被 static-server.mjs 复用。
 *
 * 职责：
 *  - POST /api/usage   接收前端上报（见 docs/usage-report-api.md），白名单校验后
 *                      追加到 server/data/usage.jsonl（JSON Lines，数据量小，无需数据库）
 *  - GET  /stats       汇总统计页面（打开次数/分析数/token 总量/去重用户/每日趋势）
 *
 * 隐私：只持久化前端白名单计数（工具名/版本/随机ID/事件/数字），绝不存储学生数据。
 */

import {
  appendFileSync, existsSync, mkdirSync, readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(ROOT, 'data');
export const DATA_FILE = join(DATA_DIR, 'usage.jsonl');

/** 白名单字段：丢弃上报中任何未知字段（防脏数据/防误存学生数据） */
const EVENT_WHITELIST = new Set(['open', 'analysis_succeeded', 'analysis_failed']);
const TOP_WHITELIST = ['tool', 'version', 'clientId', 'event', 'occurredAt', 'payload'];
const PAYLOAD_WHITELIST = new Set(['students', 'errorCategory', 'usage', 'cumulative']);
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

/** 逐行解析 JSONL（损坏行跳过，绝不抛错） */
export function parseRecords(text) {
  const records = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && typeof obj.event === 'string') records.push(obj);
    } catch {
      // 跳过损坏行
    }
  }
  return records;
}

/** 汇总统计（纯函数，供 /stats 与测试复用） */
export function summarize(records) {
  let opens = 0, succeeded = 0, failed = 0;
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
    else if (r.event === 'analysis_succeeded') {
      succeeded += 1;
      totalStudents += num(p.students) ?? 0;
      if (p.usage) {
        promptTokens += num(p.usage.promptTokens) ?? 0;
        completionTokens += num(p.usage.completionTokens) ?? 0;
        cacheHitTokens += num(p.usage.cacheHitTokens) ?? 0;
      }
    } else if (r.event === 'analysis_failed') failed += 1;
  }

  const trend = [...daily.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    opens, succeeded, failed, totalStudents,
    promptTokens, completionTokens, cacheHitTokens,
    totalTokens: promptTokens + completionTokens,
    uniqueClients: clients.size,
    records: records.length,
    trend,
  };
}

/** 统计页面（内联 HTML，浅色简洁风） */
export function statsHtml(s) {
  const fmt = (n) => n.toLocaleString('zh-CN');
  const maxTrend = Math.max(1, ...s.trend.map((t) => t.count));
  const bars = s.trend.map((t) =>
    `<tr><td class="d">${t.date}</td><td class="bar"><span style="width:${((t.count / maxTrend) * 100).toFixed(1)}%">${t.count}</span></td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>使用情况统计</title>
<style>
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",sans-serif; background:#f8fafc; color:#334155; font-size:14px; }
  .wrap { max-width:760px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:20px; color:#0f172a; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }
  .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; }
  .card .n { font-size:26px; font-weight:700; color:#047857; }
  .card .l { margin-top:4px; font-size:12px; color:#64748b; }
  h2 { margin-top:32px; font-size:16px; color:#0f172a; }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; }
  td,th { padding:8px 12px; border-bottom:1px solid #f1f5f9; text-align:left; }
  th { background:#f8fafc; font-size:12px; color:#64748b; }
  .bar span { display:block; height:16px; background:#10b981; border-radius:4px; color:#fff; font-size:11px; line-height:16px; padding-left:6px; min-width:20px; }
  .muted { color:#94a3b8; font-size:12px; }
</style></head>
<body><div class="wrap">
  <h1>珍珠生走访审核辅助平台 · 使用情况统计</h1>
  <p class="muted">数据仅包含白名单计数（打开/分析/token），不含任何学生数据。</p>
  <div class="grid">
    <div class="card"><div class="n">${fmt(s.opens)}</div><div class="l">工具打开次数</div></div>
    <div class="card"><div class="n">${fmt(s.succeeded)}</div><div class="l">分析报告数</div></div>
    <div class="card"><div class="n">${fmt(s.failed)}</div><div class="l">分析失败次数</div></div>
    <div class="card"><div class="n">${fmt(s.uniqueClients)}</div><div class="l">使用人数（按浏览器）</div></div>
    <div class="card"><div class="n">${fmt(s.totalStudents)}</div><div class="l">累计分析学生数</div></div>
    <div class="card"><div class="n">${fmt(s.totalTokens)}</div><div class="l">token 总量（输入+输出）</div></div>
  </div>
  <h2>token 用量明细</h2>
  <table><tr><th>类型</th><th>数值</th></tr>
    <tr><td>输入 token（prompt）</td><td>${fmt(s.promptTokens)}</td></tr>
    <tr><td>输出 token（completion）</td><td>${fmt(s.completionTokens)}</td></tr>
    <tr><td>缓存命中 token</td><td>${fmt(s.cacheHitTokens)}</td></tr>
  </table>
  <h2>每日使用趋势</h2>
  <table>${bars || '<tr><td class="muted">暂无数据</td></tr>'}</table>
  <h2>事件类型分布</h2>
  <table><tr><th>事件</th><th>次数</th></tr>
    <tr><td>open</td><td>${fmt(s.opens)}</td></tr>
    <tr><td>analysis_succeeded</td><td>${fmt(s.succeeded)}</td></tr>
    <tr><td>analysis_failed</td><td>${fmt(s.failed)}</td></tr>
  </table>
  <p class="muted" style="margin-top:24px">记录总数：${fmt(s.records)} 条 · 数据文件：server/data/usage.jsonl</p>
</div></body></html>`;
}

/** 追加一条已清洗的上报记录到 JSONL；失败返回 false（绝不抛错） */
export function appendUsage(clean) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(DATA_FILE, JSON.stringify(clean) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** 读取全部记录文本（文件不存在返回空串） */
export function readUsageText() {
  return existsSync(DATA_FILE) ? readFileSync(DATA_FILE, 'utf8') : '';
}

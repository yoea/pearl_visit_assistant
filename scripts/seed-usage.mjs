/**
 * 生成演示统计数据（一次性种子脚本，Node 24+）。
 * 运行前请确认目标统计库为空/可覆盖；数据均为虚构演示数字，无任何真实学生信息。
 * 用法：node scripts/seed-usage.mjs   （cwd 为项目根，写入 server/data/usage.db）
 */
import { appendUsage, setDbPath } from '../server/usage-core.mjs';

setDbPath(new URL('../server/data/usage.db', import.meta.url).pathname);

/** 目标演示口径 */
const TARGET = {
  opens: 95, uploads: 59, analyses: 37, md: 4, html: 9, searches: 21,
  clients: 51, students: 231, promptTokens: 740000, completionTokens: 136342,
};

// 可复现伪随机（LCG）
let seed = 42;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

const START = Date.parse('2026-08-20T00:00:00');
const END = Date.parse('2026-09-08T23:59:59');
function ts() { return new Date(START + rnd() * (END - START)).toISOString(); }

const clients = Array.from({ length: TARGET.clients }, (_, i) => `demo-${String(i + 1).padStart(2, '0')}`);
const VERSION = 'v1.1.0';

let inserted = 0;
function add(event, clientId, payload = {}) {
  if (appendUsage({ tool: 'pearl-visit-assistant', version: VERSION, clientId, event, occurredAt: ts(), payload })) inserted += 1;
}

// 打开 95：先保证 51 人每人至少一次，再随机补足
for (let i = 0; i < TARGET.clients; i++) add('open', clients[i]);
for (let i = 0; i < TARGET.opens - TARGET.clients; i++) add('open', pick(clients));

// 上传 59（带学生数，随机 60-100）
for (let i = 0; i < TARGET.uploads; i++) {
  add('file_uploaded', pick(clients), { students: 60 + Math.floor(rnd() * 41) });
}

// 分析 37：学生合计 231（28 笔 ×6 + 9 笔 ×7），token：prompt 20000/笔；completion 36×3684 + 1×3718 = 136342
const comps = Array.from({ length: TARGET.analyses }, (_, i) => (i === 0 ? 3718 : 3684));
for (let i = 0; i < TARGET.analyses; i++) {
  const students = i < 28 ? 6 : 7;
  add('analysis_succeeded', pick(clients), {
    students,
    usage: {
      apiCalls: 1 + Math.floor(rnd() * 2),
      promptTokens: 20000,
      completionTokens: comps[i],
      cacheHitTokens: Math.floor(rnd() * 8000),
    },
    cumulative: {
      analyses: i + 1,
      promptTokens: 20000 * (i + 1),
      completionTokens: comps.slice(0, i + 1).reduce((a, b) => a + b, 0),
      totalTokens: 20000 * (i + 1) + comps.slice(0, i + 1).reduce((a, b) => a + b, 0),
    },
  });
}

// 下载与搜索
for (let i = 0; i < TARGET.md; i++) add('report_downloaded', pick(clients), { format: 'markdown' });
for (let i = 0; i < TARGET.html; i++) add('report_downloaded', pick(clients), { format: 'html' });
for (let i = 0; i < TARGET.searches; i++) add('student_search', pick(clients));

console.log(`已插入 ${inserted} 条演示记录。`);
console.log('口径：打开 95 / 上传 59 / 分析 37 / 下载 md4+html9 / 搜索 21 / 学生 231 / token 876342');

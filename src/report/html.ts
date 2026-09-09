import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';
import type { AnonymizedStudent } from '../types/student';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import { checkNumericIssues } from '../anonymization/numeric-validation';
import { countReviewStatuses } from './review-status';
import { countDifficultyReasons } from './difficulty-reason';
import { REVIEW_STATUS_COLORS } from './review-status';

/**
 * 报告 → 单文件 HTML（完全自包含：内联 CSS + CSS 柱状图，无任何外部资源，离线可打开）。
 * 所有动态文本经 escapeHtml 转义，防止内容破坏 HTML 结构。
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>');
}

function basicInfoRows(s: AnonymizedStudent): string {
  const rows: string[] = [];
  // 数字校验（与页面同一规则）：异常值后附「疑似填写错误待核实」标签
  const issueKeys = new Set(checkNumericIssues(s).map((i) => i.key));
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId' || k === 'reviewStatus') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    const badge = issueKeys.has(k)
      ? ' <span class="badge-warn">疑似填写错误待核实</span>'
      : '';
    rows.push(`<tr><td>${escapeHtml(STUDENT_FIELD_LABELS[k])}</td><td>${escapeHtml(String(v))}${badge}</td></tr>`);
  }
  return rows.length > 0 ? rows.join('') : '<tr><td colspan="2">暂无。</td></tr>';
}

/** CSS 横向条形图：[{label, count, color}] → div 条（宽度按最大计数归一） */
function cssBarChart(items: { label: string; count: number }[]): string {
  const max = Math.max(1, ...items.map((i) => i.count));
  const bars = items.map((i) => `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(i.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${((i.count / max) * 100).toFixed(1)}%"></span></span>
      <span class="bar-count">${i.count} 人</span>
    </div>`).join('');
  return bars || '<p class="empty">暂无数据。</p>';
}

function listItems(items: string[], empty: string, tone = ''): string {
  if (items.length === 0) return `<p class="empty">${empty}</p>`;
  return `<ul>${items.map((i) => `<li class="${tone}">${escapeHtml(i)}</li>`).join('')}</ul>`;
}

const IMPORTANCE_TONE: Record<string, string> = {
  high: 'tag-high', medium: 'tag-mid', low: 'tag-low',
};
const IMPORTANCE_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' };

export function reportToHtml(report: Report, nameIndex?: ReadonlyMap<string, string>): string {
  const sa = report.schoolAnalysis;
  const students = report.students;
  const dataById = new Map(report.studentsData.map((s) => [s.anonymousId, s]));

  // 图表数据：本地脱敏数据的困难度分布 + 因素重要性统计（数据不足时图表显示暂无）
  const levelCounts = new Map<string, number>();
  for (const s of report.studentsData) {
    const lv = s.difficultyLevel;
    if (lv == null || lv === '') continue;
    levelCounts.set(lv, (levelCounts.get(lv) ?? 0) + 1);
  }
  const levelChart = [...levelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  const importanceCounts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
  for (const g of students) {
    for (const f of g.mainDifficultyFactors) {
      importanceCounts[f.importance] = (importanceCounts[f.importance] ?? 0) + 1;
    }
  }
  const factorChart = [['high', '高'], ['medium', '中'], ['low', '低']]
    .map(([key, label]) => ({ label, count: importanceCounts[key] ?? 0 }))
    .filter((i) => i.count > 0);

  const studentSections = students.map((g) => {
    const display = nameIndex?.get(g.studentId) ?? g.studentId;
    const title = nameIndex?.has(g.studentId) ? `${display}（${g.studentId}）` : display;
    const local = dataById.get(g.studentId);
    const reviewStatus = local?.reviewStatus?.trim();
    const highFactors = g.mainDifficultyFactors.filter((f) => f.importance === 'high');
    const factors = g.mainDifficultyFactors.map((f) => `
      <div class="factor">
        <span class="tag ${IMPORTANCE_TONE[f.importance]}">${IMPORTANCE_LABEL[f.importance]}</span>
        <div class="factor-body"><b>${escapeHtml(f.factor)}</b><p>${escapeHtml(f.evidence)}</p></div>
      </div>`).join('');
    const questions = g.interviewQuestions.map((q, i) =>
      `<li><span class="num">${i + 1}</span>${escapeHtml(q)}</li>`).join('');
    return `
<section class="student" id="stu-${g.studentId}">
  <h3>${escapeHtml(title)}${reviewStatus ? ` <span class="tag tag-mid">审核状态：${escapeHtml(reviewStatus)}</span>` : ''}</h3>
  ${highFactors.length > 0
    ? `<div class="banner-warn">重点困难：${highFactors.map((f) =>
      `<span class="tag tag-high">${escapeHtml(f.factor)}</span>`).join('')}</div>`
    : ''}
  <h4>材料要点摘要</h4>
  <div class="textcard"><span class="tc-icon">📝</span><span>${escapeHtml(g.summary)}</span></div>
  <h4>家庭情况概括</h4>
  <div class="textcard green"><span class="tc-icon">👪</span><span>${escapeHtml(g.familySituation)}</span></div>
  <h4 class="fold-head">基本情况 <span class="fold-toggle">展开</span></h4>
  <div class="fold-body" hidden>
    <table class="info"><tbody>${local ? basicInfoRows(local) : '<tr><td colspan="2">暂无。</td></tr>'}</tbody></table>
  </div>
  <h4>主要困难因素</h4>
  ${factors ? `<div class="factors">${factors}</div>` : '<p class="empty">材料中未识别出明显困难因素。</p>'}
  <h4 class="warn-red">需要重点核实</h4>
  <div class="card-warn">${listItems(g.informationToVerify, '暂未发现明显需要核实的事项。', 'warn')}</div>
  <h4>推荐面谈问题</h4>
  <ol class="questions">${questions || '<p class="empty">暂无。</p>'}</ol>
  <h4 class="warn">面谈注意事项</h4>
  <div class="card-amber">${listItems(g.interviewNotes, '无特殊注意事项。', 'warn')}</div>
</section>`;
  }).join('\n');

  const guideSections = GENERAL_GUIDE.map((sec) => `
<section class="guide">
  <h4>${escapeHtml(sec.section)}</h4>
  <ul>${sec.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
</section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>走访参考报告 — ${escapeHtml(report.schoolName)}（${escapeHtml(report.cohort)}）</title>
<style>
  :root { --emerald: #047857; --amber: #b45309; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f8fafc; color: #334155; font-size: 14px; line-height: 1.7; }
  .page { max-width: 900px; margin: 0 auto; padding: 24px 16px 48px; }
  .banner { background: #047857; color: #fff; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
  .banner h1 { margin: 0; font-size: 20px; }
  .banner p { margin: 4px 0 0; font-size: 12px; opacity: .85; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 16px; }
  .card h2 { margin: 0 0 12px; font-size: 16px; color: #0f172a; border-left: 4px solid #047857; padding-left: 10px; }
  .card h3 { margin: 16px 0 8px; font-size: 14px; color: #0f172a; }
  .card h4 { margin: 14px 0 6px; font-size: 13px; color: #475569; }
  .card h4.warn { color: #b45309; }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  li.warn { color: #b45309; }
  .empty { color: #94a3b8; font-size: 12px; }
  table.info { border-collapse: collapse; width: 100%; font-size: 12px; }
  table.info td { border: 1px solid #e2e8f0; padding: 4px 8px; }
  table.info td:first-child { background: #f8fafc; color: #64748b; white-space: nowrap; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; }
  .tag-high { background: #fef3c7; color: #b45309; }
  .tag-mid { background: #dbeafe; color: #1d4ed8; }
  .tag-low { background: #f1f5f9; color: #64748b; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .bar-label { width: 72px; flex-shrink: 0; font-size: 12px; color: #475569; text-align: right; }
  .bar-track { flex: 1; background: #f1f5f9; border-radius: 999px; height: 14px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; background: #059669; border-radius: 999px; }
  .bar-count { width: 48px; font-size: 12px; color: #64748b; }
  .student { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; background: #fff; }
  .student h3 { margin: 0 0 8px; font-size: 15px; color: #047857; }
  .banner-warn { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 12px; margin-bottom: 10px; font-size: 12px; color: #92400e; }
  .card-warn { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; }
  .card-amber { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; }
  h4.warn-red { color: #b91c1c; }
  .badge-warn { display: inline-block; background: #fef3c7; color: #b45309; border-radius: 4px; padding: 0 6px; font-size: 11px; margin-left: 4px; white-space: nowrap; }
  [hidden] { display: none !important; }
  .fold-head { cursor: pointer; user-select: none; transition: color .15s; }
  .fold-head:hover { color: #047857; }
  .fold-toggle { color: #047857; font-size: 12px; font-weight: 500; margin-left: 6px; }
  .factors { display: flex; flex-direction: column; gap: 6px; }
  .factor { display: flex; gap: 8px; align-items: flex-start; background: #f8fafc; border-radius: 8px; padding: 8px 12px; }
  .factor-body b { font-size: 13px; color: #1e293b; }
  .factor-body p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
  .textcard { display: flex; gap: 8px; align-items: flex-start; background: #f8fafc; border-left: 3px solid #93c5fd; border-radius: 6px; padding: 8px 12px; margin: 4px 0; }
  .textcard.green { border-left-color: #6ee7b7; }
  .tc-icon { font-size: 15px; line-height: 1.6; flex-shrink: 0; }
  .questions { list-style: none; padding-left: 0; margin-top: 4px; }
  .questions li { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; }
  .num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 999px; background: #d1fae5; color: #047857; font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .guide { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px; background: #fff; }
  .guide h4 { margin: 0 0 6px; font-size: 13px; color: #334155; }
  .search-bar { position: sticky; top: 10px; z-index: 25; max-width: 360px; margin: 0 0 14px; padding: 5px; background: #fff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
  .search-bar input { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 12px; font-size: 13px; outline: none; }
  .search-bar input:focus { border-color: #10b981; }
  #searchResults { display: none; position: absolute; z-index: 30; top: 100%; left: 4px; right: 4px; margin: 4px 0 0; padding: 0; list-style: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.08); max-height: 240px; overflow: auto; }
  #searchResults li { padding: 7px 12px; font-size: 13px; cursor: pointer; }
  #searchResults li:hover { background: #ecfdf5; }
  #searchResults li .sub { color: #94a3b8; font-size: 11px; margin-left: 6px; }
  #searchResults li.empty { color: #94a3b8; cursor: default; }
  .flash { animation: flashBg 1.6s ease-out; }
  @keyframes flashBg { 0% { background: #fef3c7; } 100% { background: #fff; } }
  @media print {
    /* A4 打印优化策略：
       ① 大容器（.card/.student）允许跨页流动——绝不用 break-inside: avoid 硬塞，
          否则首页不满时整个大卡被后移 → 大片空白；
       ② 只对小块（文本卡/因素/警示块）防截断，标题防孤行（break-after: avoid）；
       ③ 每个学生仍从新页开始（first 接排首页，顺势填满不浪费）；字号行距紧凑。 */
    body { background: #fff; font-size: 11.5px; line-height: 1.5; }
    .page { padding: 6px; }
    .banner { padding: 9px 13px; margin-bottom: 8px; break-inside: avoid; }
    .banner h1 { font-size: 16px; margin: 0; }
    .banner p { margin: 2px 0 0; }
    .card { padding: 8px 12px; margin-bottom: 6px; border: none; background: none; box-shadow: none; }
    .card h2 { font-size: 13px; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; }
    h3, h4 { break-after: avoid; }
    .card h3 { font-size: 12px; margin: 8px 0 4px; }
    .card h4 { font-size: 11.5px; margin: 6px 0 3px; }
    .student { padding: 4px 0 10px; margin: 0; break-before: page; }
    .student:first-of-type { break-before: auto; }
    .student h3 { font-size: 12.5px; margin: 0 0 4px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; }
    .textcard, .factor, .card-warn, .card-amber, .banner-warn, .guide { padding: 5px 9px; margin: 3px 0; break-inside: avoid; }
    p, li { font-size: 11.5px; margin: 2px 0; }
    /* 基本情况表格紧凑：窄 label 列 + 内容列，减少空置感 */
    table.info { font-size: 10.5px; border-collapse: collapse; }
    table.info td { padding: 1px 4px; border: none; }
    table.info tr { border-bottom: 1px solid #f1f5f9; }
    table.info td:first-child { width: 112px; }
    .bar-label { font-size: 10.5px; }
    .bar-count { font-size: 10.5px; }
    .bar-track { height: 8px; }
    /* 打印时强制展开基本情况折叠（[hidden] 优先级低于本规则：本规则置于其后） */
    [hidden] { display: block !important; }
    .fold-toggle { display: none; }
    .search-bar { display: none; }
  }
  @media (max-width: 640px) {
    body { font-size: 13px; }
    .page { padding: 14px 10px 40px; }
    .banner { padding: 12px 14px; }
    .banner h1 { font-size: 17px; }
    .card { padding: 14px; }
    .student { padding: 12px 14px; }
    table.info { display: block; overflow-x: auto; white-space: nowrap; }
    .bar-label { width: 56px; }
    .bar-count { width: 44px; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- 顶部保密警示（红色强调） -->
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#b91c1c;font-size:13px;font-weight:600">
    ⚠ 保密提示：本报告含学生个人信息，仅供走访工作使用，严禁外传或用于其他用途。
  </div>
  <div class="banner">
    <h1>走访参考报告 — ${escapeHtml(report.schoolName)}（${escapeHtml(report.cohort)}）</h1>
    <p>生成时间：${escapeHtml(report.generatedAt)} · 本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。</p>
    ${report.audit ? `<p>审核安排：审核人 ${escapeHtml(report.audit.auditor)} · 走访人 ${escapeHtml(report.audit.visitor1)}${report.audit.visitor2 ? ` / ${escapeHtml(report.audit.visitor2)}` : ''}</p>` : ''}
  </div>

  ${(() => {
    const sc = countReviewStatuses(report.studentsData);
    if (sc.length === 0) return '';
    return `
  <div class="card" style="padding:14px 18px">
    <h2 style="margin:0 0 8px">审核状态概览</h2>
    <p style="margin:0 0 10px;font-size:13px">本批次共 ${report.studentsData.length} 名学生 · 已标注审核状态 ${sc.reduce((a, i) => a + i.count, 0)} 人</p>
    <ul style="margin:0;padding-left:18px">${sc.map((i) => `<li style="font-size:13px;margin:2px 0">${escapeHtml(i.status)}：${i.count} 人</li>`).join('')}</ul>
    <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">注：状态为导入表格时的快照，并非实时；请以基金会的实时审核记录为准。</p>
  </div>`;
  })()}

  <div class="card">
    <h2>一、学校整体情况</h2>
    <p>${escapeHtml(sa.overview)}</p>
    ${(() => {
      const reasons = countDifficultyReasons(report.studentsData);
      if (reasons.length === 0) return '';
      const rows = reasons.map((i, idx) => `
        <tr><td style="padding:2px 8px 2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:99px;background:${REVIEW_STATUS_COLORS[idx % REVIEW_STATUS_COLORS.length]};margin-right:6px"></span>${escapeHtml(i.label)}</td>
        <td style="padding:2px 8px;text-align:right">${i.count} 人</td></tr>`).join('');
      return `
    <h3>困难原因分布（申请材料填写，多选已拆分）</h3>
    <table style="width:auto;min-width:280px;border-collapse:collapse">${rows}</table>`;
    })()}
    <h3>困难类型分布</h3>
    ${levelChart.length > 0 ? cssBarChart(levelChart) : '<p class="empty">材料中未填写困难度，无法统计。</p>'}
    ${factorChart.length > 0 ? `<h3>困难因素重要性分布</h3>${cssBarChart(factorChart)}` : ''}
    ${sa.difficultyPatterns.length > 0
      ? `<h3>AI 归纳的困难类型</h3><p class="tags">${sa.difficultyPatterns.map((p) =>
        `<span class="tag tag-low">${escapeHtml(p)}</span>`).join('')}</p>`
      : ''}
    <h3>共性问题</h3>
    ${listItems(sa.commonIssues, '暂无。')}
    <h3 class="warn">材料质量提示</h3>
    ${listItems(sa.dataQualityIssues, '全部学生材料完整。', 'warn')}
    <h3>重点核实主题</h3>
    ${sa.keyVerificationTopics.length > 0
      ? `<p class="tags">${sa.keyVerificationTopics.map((t) => `<span class="tag tag-mid">${escapeHtml(t)}</span>`).join('')}</p>`
      : '<p class="empty">暂无。</p>'}
  </div>

  ${nameIndex && nameIndex.size > 0 ? `
  <!-- 学生搜索（悬浮跟随：输入姓名实时下拉 → 点击定位到该学生，可连续搜索不用回顶部） -->
  <div class="search-bar">
    <input id="studentSearch" type="text" placeholder="输入学生姓名快速定位…" autocomplete="off">
    <ul id="searchResults"></ul>
  </div>` : ''}
  <div class="card">
    <h2>二、单个学生面谈参考</h2>
    ${studentSections}
  </div>

  ${report.cleanIssues && report.cleanIssues.length > 0 ? `
  <div class="card-warn" style="padding:14px 18px;margin-bottom:16px">
    <h3 style="margin:0 0 6px;font-size:14px;color:#b91c1c">资料填写问题（${report.cleanIssues.length} 处，已自动清除敏感信息）</h3>
    <p style="margin:0 0 8px;font-size:12px;color:#92400e">以下字段疑似误填了证件号/电话等敏感信息，发送给 AI 的内容已不含原文；走访时请向学生核实真实内容。</p>
    <ul style="margin:0;padding-left:18px">${report.cleanIssues.map((c) => {
      const name = nameIndex?.get(c.studentId);
      return `<li style="font-size:13px;color:#7f1d1d">${escapeHtml(name ? `${name}（${c.studentId}）` : c.studentId)}：${escapeHtml(c.fieldLabel)} 原填 ${escapeHtml(c.originalMasked)}，${escapeHtml(c.note)}</li>`;
    }).join('')}</ul>
  </div>` : ''}
  <div class="card">
    <h2>三、通用面谈指南</h2>
    ${guideSections}
  </div>

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.9">
    <p style="margin:0">Copyright © 新华教育基金会 All Rights Reserved.</p>
    <p style="margin:0">工具作者：品牌传播部×公益数字化 永银Ethan</p>
  </div>
</div>
<script>
// 报告文件内置脚本（纯内联，无外部依赖）：
// 1) 基本情况折叠（与平台页面一致）
document.querySelectorAll('.fold-head').forEach(function (h) {
  h.addEventListener('click', function () {
    var body = h.nextElementSibling;
    var open = body.hidden;
    body.hidden = !open;
    var t = h.querySelector('.fold-toggle');
    if (t) t.textContent = open ? '收起' : '展开';
  });
});
// 2) 学生搜索：输入姓名实时下拉 → 点击定位到该学生并高亮（数据即页面内姓名）
(function () {
  var input = document.getElementById('studentSearch');
  var list = document.getElementById('searchResults');
  if (!input || !list) return;
  var names = ${JSON.stringify(Object.fromEntries(nameIndex?.entries() ?? [])).replace(/</g, '\\u003c')};
  var ids = Object.keys(names);
  function render(q) {
    var t = q.trim();
    list.innerHTML = '';
    if (t === '') { list.style.display = 'none'; return; }
    var hits = ids.filter(function (id) { return names[id].includes(t) || id.includes(t); }).slice(0, 10);
    if (hits.length === 0) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '未找到匹配的学生';
      list.appendChild(li);
    } else {
      hits.forEach(function (id) {
        var li = document.createElement('li');
        li.innerHTML = '<span>' + names[id].replace(/</g, '&lt;') + '</span><span class="sub">' + id + '</span>';
        li.addEventListener('click', function () { locate(id); });
        list.appendChild(li);
      });
    }
    list.style.display = 'block';
  }
  function locate(id) {
    input.value = '';
    list.style.display = 'none';
    var el = document.getElementById('stu-' + id);
    if (!el) return;
    // 居中定位：避免被顶部悬浮搜索条遮挡标题；定位后悬浮条仍在视口顶部，可直接搜下一位
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth; // 重启动画
    el.classList.add('flash');
    // 定位后展开该生折叠的基本情况
    var fold = el.querySelector('.fold-head');
    if (fold && fold.nextElementSibling && fold.nextElementSibling.hidden) {
      fold.nextElementSibling.hidden = false;
      var tg = fold.querySelector('.fold-toggle');
      if (tg) tg.textContent = '收起';
    }
  }
  input.addEventListener('input', function () { render(input.value); });
  input.addEventListener('focus', function () { render(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; list.style.display = 'none'; } });
  document.addEventListener('click', function (e) {
    if (!input.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
  });
})();
</script>
</body>
</html>
`;
}

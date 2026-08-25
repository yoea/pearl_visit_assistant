import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';
import type { AnonymizedStudent } from '../types/student';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';

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
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    rows.push(`<tr><td>${escapeHtml(STUDENT_FIELD_LABELS[k])}</td><td>${escapeHtml(String(v))}</td></tr>`);
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
    return `
<section class="student">
  <h3>${escapeHtml(title)}</h3>
  ${g.mainDifficultyFactors.length > 0
    ? `<p class="tags">${g.mainDifficultyFactors.map((f) =>
      `<span class="tag ${IMPORTANCE_TONE[f.importance]}">${escapeHtml(f.factor)} · ${f.importance}</span>`).join('')}</p>`
    : ''}
  <h4>基本情况</h4>
  <table class="info"><tbody>${local ? basicInfoRows(local) : '<tr><td colspan="2">暂无。</td></tr>'}</tbody></table>
  <h4>材料要点摘要</h4>
  <p>${escapeHtml(g.summary)}</p>
  <h4>家庭情况概括</h4>
  <p>${escapeHtml(g.familySituation)}</p>
  <h4>主要困难因素</h4>
  ${g.mainDifficultyFactors.length > 0
    ? `<ul>${g.mainDifficultyFactors.map((f) =>
      `<li><b>${escapeHtml(f.factor)}</b>（${f.importance}）：${escapeHtml(f.evidence)}</li>`).join('')}</ul>`
    : '<p class="empty">材料中未识别出明显困难因素。</p>'}
  <h4 class="warn">需要重点核实</h4>
  ${listItems(g.informationToVerify, '暂未发现明显需要核实的事项。', 'warn')}
  <h4>推荐面谈问题</h4>
  ${g.interviewQuestions.length > 0
    ? `<ol>${g.interviewQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ol>`
    : '<p class="empty">暂无。</p>'}
  <h4 class="warn">面谈注意事项</h4>
  ${listItems(g.interviewNotes, '无特殊注意事项。', 'warn')}
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
  .guide { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px; background: #fff; }
  .guide h4 { margin: 0 0 6px; font-size: 13px; color: #334155; }
  @media print { body { background: #fff; } .card, .student { break-inside: avoid; } }
</style>
</head>
<body>
<div class="page">
  <div class="banner">
    <h1>走访参考报告 — ${escapeHtml(report.schoolName)}（${escapeHtml(report.cohort)}）</h1>
    <p>生成时间：${escapeHtml(report.generatedAt)} · 本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。</p>
  </div>

  <div class="card">
    <h2>一、学校整体情况</h2>
    <p>${escapeHtml(sa.overview)}</p>
    <h3>困难类型分布</h3>
    ${levelChart.length > 0 ? cssBarChart(levelChart) : '<p class="empty">材料中未填写困难度，无法统计。</p>'}
    ${factorChart.length > 0 ? `<h3>困难因素重要性分布</h3>${cssBarChart(factorChart)}` : ''}
    <h3>共性问题</h3>
    ${listItems(sa.commonIssues, '暂无。')}
    <h3 class="warn">材料质量提示</h3>
    ${listItems(sa.dataQualityIssues, '全部学生材料完整。', 'warn')}
    <h3>重点核实主题</h3>
    ${sa.keyVerificationTopics.length > 0
      ? `<p class="tags">${sa.keyVerificationTopics.map((t) => `<span class="tag tag-mid">${escapeHtml(t)}</span>`).join('')}</p>`
      : '<p class="empty">暂无。</p>'}
    <h3>整体面谈建议</h3>
    ${listItems(sa.interviewSuggestions, '暂无。')}
  </div>

  <div class="card">
    <h2>二、单个学生面谈参考</h2>
    ${studentSections}
  </div>

  <div class="card">
    <h2>三、通用面谈指南</h2>
    ${guideSections}
  </div>
</div>
</body>
</html>
`;
}

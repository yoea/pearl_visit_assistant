import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';
import type { AnonymizedStudent } from '../types/student';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import { checkNumericIssues } from '../anonymization/numeric-validation';
import { countReviewStatuses } from './review-status';

/**
 * 动态文本行转义：行首的「#」「*」「>」「-」标记与换行可能破坏 Markdown 结构
 * （仅影响本地 .md 显示，不改动报告数据本身）。
 */
export function escapeMdLine(text: string): string {
  return text
    .replace(/\r?\n/g, ' ') // 换行折叠为空格，避免打散段落/列表
    .replace(/^(?=[#*>-])/, '\\'); // 行首标题/列表/引用标记前加反斜杠转义
}

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示；异常值附校验标注） */
function basicInfoLines(s: AnonymizedStudent): string[] {
  const lines: string[] = [];
  const issueKeys = new Set(checkNumericIssues(s).map((i) => i.key));
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId' || k === 'reviewStatus') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    const warn = issueKeys.has(k) ? ' ⚠ 疑似填写错误待核实' : '';
    lines.push(`- ${STUDENT_FIELD_LABELS[k]}：${escapeMdLine(String(v))}${warn}`);
  }
  return lines;
}

/** 报告 → Markdown 文本（纯函数、确定性；不含日期随机量）。
 *  nameIndex（可选）：anonymousId → 真实姓名，仅本地显示用途；命中时标题显示「姓名（编号）」。 */
export function reportToMarkdown(report: Report, nameIndex?: ReadonlyMap<string, string>): string {
  const lines: string[] = [];
  const sa = report.schoolAnalysis;
  let sec = 1; // 主章节动态编号（有资料填写问题时顺延）

  // 顶部保密警示（红色强调；支持 HTML 的渲染器显示为红色）
  lines.push('<span style="color:#dc2626;font-weight:600">⚠ 保密提示：本报告含学生个人信息，仅供走访工作使用，严禁外传或用于其他用途。</span>');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`# ${report.title} — ${report.schoolName}（${report.cohort}）`);
  lines.push('');
  lines.push(`> 生成时间：${report.generatedAt}`);
  lines.push('> 说明：本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。');
  if (report.audit) {
    const { auditor, visitor1, visitor2 } = report.audit;
    lines.push(`> 审核安排：审核人 ${auditor} · 走访人 ${visitor1}${visitor2 ? ` / ${visitor2}` : ''}`);
  }
  lines.push('');

  // 审核状态概览（快照口径说明）
  const statusCounts = countReviewStatuses(report.studentsData);
  if (statusCounts.length > 0) {
    lines.push(`本批次共 ${report.studentsData.length} 名学生，审核状态分布：`);
    lines.push('');
    for (const i of statusCounts) lines.push(`- ${i.status}：${i.count} 人`);
    lines.push('');
    lines.push('> 注：以上状态取自导入表格时的数据快照（非实时）；名单若已在系统中流转，请以基金会实时审核记录为准。');
    lines.push('');
  }

  // 资料填写问题（发送前自动清除的敏感误填；走访时需向学生核实）
  if (report.cleanIssues && report.cleanIssues.length > 0) {
    lines.push(`## ${['一', '二', '三', '四'][sec - 1]}、资料填写问题（${report.cleanIssues.length} 处，已自动清除敏感信息）`);
    sec += 1;
    lines.push('');
    lines.push('> 以下字段疑似误填了证件号/电话等敏感信息，发送给 AI 的内容已不含原文；走访时请向学生核实真实内容。');
    lines.push('');
    for (const c of report.cleanIssues) {
      const name = nameIndex?.get(c.studentId);
      lines.push(`- ${name ? `${name}（${c.studentId}）` : c.studentId}：${c.fieldLabel} 原填 ${c.originalMasked}，${c.note}`);
    }
    lines.push('');
  }

  lines.push(`## ${['一', '二', '三', '四'][sec - 1]}、学校整体情况`);
  sec += 1;
  lines.push('');
  lines.push(escapeMdLine(sa.overview));
  lines.push('');
  lines.push('### 1. 困难类型分布');
  lines.push('');
  for (const p of sa.difficultyPatterns) lines.push(`- ${escapeMdLine(p)}`);
  if (sa.difficultyPatterns.length === 0) lines.push('- 材料中未填写困难度，且未识别出明显困难类型。');
  lines.push('');
  lines.push('### 2. 共性问题');
  lines.push('');
  for (const i of sa.commonIssues) lines.push(`- ${escapeMdLine(i)}`);
  if (sa.commonIssues.length === 0) lines.push('- 暂无。');
  lines.push('');
  lines.push('### 3. 材料质量提示');
  lines.push('');
  for (const i of sa.dataQualityIssues) lines.push(`- ${escapeMdLine(i)}`);
  if (sa.dataQualityIssues.length === 0) lines.push('- 全部学生材料完整。');
  lines.push('');
  lines.push('### 4. 重点核实主题');
  lines.push('');
  for (const t of sa.keyVerificationTopics) lines.push(`- ${escapeMdLine(t)}`);
  if (sa.keyVerificationTopics.length === 0) lines.push('- 暂无。');
  lines.push('');

  lines.push(`## ${['一', '二', '三', '四'][sec - 1]}、单个学生面谈参考`);
  sec += 1;
  lines.push('');
  const dataById = new Map(report.studentsData.map((s) => [s.anonymousId, s]));
  for (const g of report.students) {
    const display = nameIndex?.get(g.studentId) ?? g.studentId;
    lines.push(`### ${escapeMdLine(display)}${nameIndex?.has(g.studentId) ? `（${g.studentId}）` : ''}`);
    lines.push('');
    const reviewStatus = dataById.get(g.studentId)?.reviewStatus?.trim();
    if (reviewStatus) {
      lines.push(`> 审核状态：${escapeMdLine(reviewStatus)}`);
      lines.push('');
    }
    // 重点困难概览（high 因素，与页面横幅一致）
    const highFactors = g.mainDifficultyFactors.filter((f) => f.importance === 'high');
    if (highFactors.length > 0) {
      lines.push(`> 重点困难：${highFactors.map((f) => escapeMdLine(f.factor)).join('、')}`);
      lines.push('');
    }
    lines.push('#### 1. 材料要点摘要');
    lines.push('');
    lines.push(escapeMdLine(g.summary));
    lines.push('');
    lines.push('#### 2. 家庭情况概括');
    lines.push('');
    lines.push(escapeMdLine(g.familySituation));
    lines.push('');
    lines.push('#### 3. 基本情况');
    lines.push('');
    const local = dataById.get(g.studentId);
    if (local) {
      lines.push(...basicInfoLines(local));
    } else {
      lines.push('- 暂无。');
    }
    lines.push('');
    lines.push('#### 4. 主要困难因素');
    lines.push('');
    for (const f of g.mainDifficultyFactors) {
      lines.push(`- ${escapeMdLine(f.factor)}（${f.importance}）：${escapeMdLine(f.evidence)}`);
    }
    if (g.mainDifficultyFactors.length === 0) lines.push('- 材料中未识别出明显困难因素。');
    lines.push('');
    lines.push('#### 5. 需要重点核实');
    lines.push('');
    for (const v of g.informationToVerify) lines.push(`- ${escapeMdLine(v)}`);
    if (g.informationToVerify.length === 0) lines.push('- 暂未发现明显需要核实的事项。');
    lines.push('');
    lines.push('#### 6. 推荐面谈问题');
    lines.push('');
    g.interviewQuestions.forEach((q, i) => lines.push(`${i + 1}. ${escapeMdLine(q)}`));
    if (g.interviewQuestions.length === 0) lines.push('- 暂无。');
    lines.push('');
    lines.push('#### 7. 面谈注意事项');
    lines.push('');
    for (const c of g.interviewNotes) lines.push(`- ${escapeMdLine(c)}`);
    if (g.interviewNotes.length === 0) lines.push('- 无特殊注意事项。');
    lines.push('');
  }

  lines.push(`## ${['一', '二', '三', '四'][sec - 1]}、通用面谈指南`);
  lines.push('');
  for (const section of GENERAL_GUIDE) {
    lines.push(`### ${section.section}`);
    lines.push('');
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push('');
  }

  // 页脚：版权与作者（保密提示已在文件最顶部）
  lines.push('---');
  lines.push('');
  lines.push('> Copyright © 新华教育基金会 All Rights Reserved.');
  lines.push('> 工具作者：品牌传播部×公益数字化 永银Ethan');
  lines.push('');

  return lines.join('\n');
}

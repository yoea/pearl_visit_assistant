import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';
import type { AnonymizedStudent } from '../types/student';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';

/**
 * 动态文本行转义：行首的「#」「*」「>」「-」标记与换行可能破坏 Markdown 结构
 * （仅影响本地 .md 显示，不改动报告数据本身）。
 */
export function escapeMdLine(text: string): string {
  return text
    .replace(/\r?\n/g, ' ') // 换行折叠为空格，避免打散段落/列表
    .replace(/^(?=[#*>-])/, '\\'); // 行首标题/列表/引用标记前加反斜杠转义
}

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示） */
function basicInfoLines(s: AnonymizedStudent): string[] {
  const lines: string[] = [];
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    lines.push(`- ${STUDENT_FIELD_LABELS[k]}：${escapeMdLine(String(v))}`);
  }
  return lines;
}

/** 报告 → Markdown 文本（纯函数、确定性；不含日期随机量） */
export function reportToMarkdown(report: Report): string {
  const lines: string[] = [];
  const sa = report.schoolAnalysis;

  lines.push(`# ${report.title} — ${report.schoolName}（${report.cohort}）`);
  lines.push('');
  lines.push(`> 生成时间：${report.generatedAt}`);
  lines.push('> 说明：本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。');
  lines.push('');

  lines.push('## 一、学校整体情况');
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
  lines.push('### 5. 整体面谈建议');
  lines.push('');
  for (const s of sa.interviewSuggestions) lines.push(`- ${escapeMdLine(s)}`);
  if (sa.interviewSuggestions.length === 0) lines.push('- 暂无。');
  lines.push('');

  lines.push('## 二、单个学生面谈参考');
  lines.push('');
  const dataById = new Map(report.studentsData.map((s) => [s.anonymousId, s]));
  for (const g of report.students) {
    lines.push(`### ${g.studentId}`);
    lines.push('');
    lines.push('#### 1. 基本情况');
    lines.push('');
    const local = dataById.get(g.studentId);
    if (local) {
      lines.push(...basicInfoLines(local));
    } else {
      lines.push('- 暂无。');
    }
    lines.push('');
    lines.push('#### 2. 材料要点摘要');
    lines.push('');
    lines.push(escapeMdLine(g.summary));
    lines.push('');
    lines.push('#### 3. 家庭情况概括');
    lines.push('');
    lines.push(escapeMdLine(g.familySituation));
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

  lines.push('## 三、通用面谈指南');
  lines.push('');
  for (const section of GENERAL_GUIDE) {
    lines.push(`### ${section.section}`);
    lines.push('');
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push('');
  }

  return lines.join('\n');
}

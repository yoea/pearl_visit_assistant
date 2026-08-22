import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';

/** 报告 → Markdown 文本（纯函数、确定性；不含日期随机量） */
export function reportToMarkdown(report: Report): string {
  const lines: string[] = [];
  const o = report.overview;

  lines.push(`# 走访参考报告 — ${report.schoolName}（${report.cohort}）`);
  lines.push('');
  lines.push(`> 生成时间：${report.generatedAt}`);
  lines.push('> 说明：本报告基于脱敏后的申请材料由规则引擎生成，仅供走访参考，不构成任何资助结论。');
  lines.push('');

  lines.push('## 一、学校整体情况');
  lines.push('');
  lines.push(`本校共 **${o.studentCount}** 名候选学生。`);
  lines.push('');
  lines.push('### 1. 困难类型分布');
  lines.push('');
  for (const [k, v] of Object.entries(o.difficultyDistribution)) {
    lines.push(`- ${k}：${v} 人`);
  }
  if (Object.keys(o.difficultyDistribution).length === 0) lines.push('- 材料中未填写困难度，且未识别出明显困难类型。');
  lines.push('');
  lines.push('### 2. 低收入家庭');
  lines.push('');
  lines.push(`低收入家庭（人均年收入低于参考线）：${o.lowIncomeCount} 人，占比 ${(o.lowIncomeRatio * 100).toFixed(1)}%。`);
  lines.push('');
  lines.push('### 3. 重大疾病家庭');
  lines.push('');
  lines.push(`${o.majorIllnessCount} 个家庭在材料中提及家人疾病/治疗情况。`);
  lines.push('');
  lines.push('### 4. 单亲/弱劳动能力家庭');
  lines.push('');
  lines.push(`${o.singleParentOrWeakLaborCount} 个家庭。`);
  lines.push('');
  lines.push('### 5. 高负债家庭');
  lines.push('');
  lines.push(`${o.highDebtCount} 个家庭。`);
  lines.push('');
  lines.push('### 6. 住房情况');
  lines.push('');
  lines.push(`租房家庭：${o.rentalCount} 个。`);
  lines.push('');
  lines.push('### 7. 远距离通学');
  lines.push('');
  lines.push(`距校超过 5 公里的学生：${o.longDistanceCount} 人。`);
  lines.push('');
  lines.push('### 8. 材料信息完整度');
  lines.push('');
  lines.push(`平均缺失字段：${o.completeness.averageMissing.toFixed(1)} / ${o.completeness.totalFields}。`);
  lines.push('');
  lines.push('### 9. 值得重点关注的学生');
  lines.push('');
  if (o.focusStudentIds.length > 0) {
    lines.push(`共 ${o.focusStudentIds.length} 名（困难因素较多）：${o.focusStudentIds.join('、')}`);
  } else {
    lines.push('暂无。');
  }
  lines.push('');
  lines.push('### 10. 整体面谈建议');
  lines.push('');
  for (const s of o.suggestions) lines.push(`- ${s}`);
  lines.push('');

  lines.push('## 二、单个学生面谈参考');
  lines.push('');
  for (const g of report.studentGuides) {
    lines.push(`### ${g.anonymousId}`);
    lines.push('');
    lines.push('#### 1. 基本情况');
    lines.push('');
    for (const kv of g.basicInfo) lines.push(`- ${kv.label}：${kv.value}`);
    lines.push('');
    lines.push('#### 2. 申请原因概括');
    lines.push('');
    lines.push(g.reasonSummary);
    lines.push('');
    lines.push('#### 3. 家庭情况概括');
    lines.push('');
    lines.push(g.familySummary);
    lines.push('');
    lines.push('#### 4. 主要困难因素');
    lines.push('');
    for (const f of g.difficultyFactors) lines.push(`- ${f.label}（${f.evidence}）`);
    if (g.difficultyFactors.length === 0) lines.push('- 材料中未识别出明显困难因素。');
    lines.push('');
    lines.push('#### 5. 需要重点核实');
    lines.push('');
    for (const v of g.verificationPoints) lines.push(`- ${v}`);
    if (g.verificationPoints.length === 0) lines.push('- 暂未发现明显需要核实的事项。');
    lines.push('');
    lines.push('#### 6. 推荐面谈问题');
    lines.push('');
    g.suggestedQuestions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    lines.push('');
    lines.push('#### 7. 面谈注意事项');
    lines.push('');
    for (const c of g.cautions) lines.push(`- ${c}`);
    if (g.cautions.length === 0) lines.push('- 无特殊注意事项。');
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

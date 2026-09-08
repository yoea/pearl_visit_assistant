import { checkNumericIssues, NUMERIC_ERROR_LABEL } from '../anonymization/numeric-validation';
import { downloadTextFile } from '../utils/download';
import type { CleanedIssue } from '../security/auto-clean';
import type { AnonymizedStudent } from '../types/student';

/**
 * 填写校验问题表导出（检查页与报告页共用）：
 * 数字校验问题（身高/体重/收入/负债等）+ 敏感信息误填（cleanIssues）合并导出 CSV。
 * 列：编号 / 姓名 / 疑似错误的点 / 正确应该什么样；带 BOM，Excel 直接打开。
 * 含学生姓名，调用方需提示妥善保管。
 */

/** 数值字段的「正确应该什么样」提示（单位导向） */
const EXPECTED_HINTS: Record<string, string> = {
  height: '身高（cm），如 165；填 1.65 系米/厘米单位错误',
  weight: '体重（kg），如 55；105 多为斤，需换算确认',
  annualIncome: '家庭年收入（元），如 30000；填 1/2/3 多为漏「万」',
  perCapitaIncome: '人均年收入（元），且不应高于年收入',
  debtStatus: '负债金额（元），如 50000；8 元等极小值不现实',
  distanceToSchoolKm: '单位应为公里（km），如 3；若填 3000 多为误写成米，需换算回公里',
  schoolChildrenCount: '上学子女人数（整数），如 2',
  zhongkaoScore: '中考成绩不应高于满分（zhongkaoFullScore）',
};

/** 组装校验问题表并下载（CSV with BOM，Excel 直接打开不乱码） */
export function exportIssuesCsv(
  schoolName: string,
  nameIndex: ReadonlyMap<string, string>,
  students: AnonymizedStudent[],
  cleanIssues: CleanedIssue[],
): void {
  const esc = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['编号,姓名,疑似错误的点,正确应该什么样'];

  for (const stu of students) {
    for (const i of checkNumericIssues(stu)) {
      const name = nameIndex.get(stu.anonymousId) ?? '';
      lines.push([
        esc(stu.anonymousId), esc(name),
        esc(`${i.label}填写「${i.value}」，${NUMERIC_ERROR_LABEL}`),
        esc(EXPECTED_HINTS[i.key] ?? '请与申请材料核对实际值'),
      ].join(','));
    }
  }
  for (const c of cleanIssues) {
    const name = nameIndex.get(c.studentId) ?? '';
    lines.push([
      esc(c.studentId), esc(name),
      esc(`${c.fieldLabel}填写疑似混入敏感信息（原值 ${c.originalMasked}），已${c.note}`),
      esc('请核对申请材料补填实际内容（该字段不应含证件号/电话等）'),
    ].join(','));
  }

  if (lines.length === 1) return; // 无问题不导出
  downloadTextFile(`填写校验问题表-${schoolName}.csv`, `﻿${lines.join('\n')}`, 'text/csv;charset=utf-8');
}

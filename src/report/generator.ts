import type { AnalysisResult } from '../analysis/provider';
import type { AnonymizedStudent } from '../types/student';
import type { Report } from './types';

/** 报告生成：仅在内存中组装（不上传、不落盘、不自动保存） */
export function generateReport(
  result: AnalysisResult,
  meta: { schoolName: string; cohort: string },
  now: Date,
  studentsData: AnonymizedStudent[],
): Report {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    title: '走访参考报告',
    schoolName: meta.schoolName,
    cohort: meta.cohort,
    generatedAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    schoolAnalysis: result.schoolAnalysis,
    students: result.students,
    studentsData,
  };
}

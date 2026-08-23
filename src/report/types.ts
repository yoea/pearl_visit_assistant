import type { SchoolAnalysis, StudentAnalysis } from '../analysis/provider';
import type { AnonymizedStudent } from '../types/student';

export interface Report {
  title: string;
  schoolName: string;
  cohort: string;
  generatedAt: string; // YYYY-MM-DD HH:mm
  schoolAnalysis: SchoolAnalysis;
  students: StudentAnalysis[];
  /** 本地脱敏学生数据（基本信息表渲染用）。仅内存引用，绝不序列化到报告文件外 */
  studentsData: AnonymizedStudent[];
}

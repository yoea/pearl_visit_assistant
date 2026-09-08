import type { SchoolAnalysis, StudentAnalysis } from '../analysis/provider';
import type { AnonymizedStudent } from '../types/student';
import type { CleanedIssue } from '../security/auto-clean';
import type { AuditAssignment } from '../data/audit-assignments';

export interface Report {
  title: string;
  schoolName: string;
  cohort: string;
  generatedAt: string; // YYYY-MM-DD HH:mm
  schoolAnalysis: SchoolAnalysis;
  students: StudentAnalysis[];
  /** 本地脱敏学生数据（基本信息表渲染用）。仅内存引用，绝不序列化到报告文件外 */
  studentsData: AnonymizedStudent[];
  /** 发送前自动清洗的敏感误填记录（供报告「资料填写问题」展示；值为掩码） */
  cleanIssues?: CleanedIssue[];
  /** 本学校审核安排（审核人/走访人；来自静态数据表，无匹配则缺省） */
  audit?: AuditAssignment;
}

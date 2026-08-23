import type { AnalysisRequest } from '../types/student';

/** 分析结果契约：只输出分析/核实/建议，严禁「通过/淘汰」类结论 */
export const IMPORTANCE_VALUES = ['high', 'medium', 'low'] as const;
export type Importance = (typeof IMPORTANCE_VALUES)[number];

export interface DifficultyFactor {
  factor: string;
  evidence: string; // 必须可追溯到申请材料
  importance: Importance;
}

export interface SchoolAnalysis {
  overview: string;
  studentCount: number;
  difficultyPatterns: string[];
  commonIssues: string[];
  dataQualityIssues: string[];
  keyVerificationTopics: string[];
  interviewSuggestions: string[];
}

export interface StudentAnalysis {
  studentId: string;
  summary: string;
  familySituation: string;
  mainDifficultyFactors: DifficultyFactor[];
  informationToVerify: string[];
  interviewQuestions: string[]; // 契约 5-8 个
  interviewNotes: string[];
}

export interface AnalysisResult {
  schoolAnalysis: SchoolAnalysis;
  students: StudentAnalysis[];
}

/**
 * 分析提供者接口。Mock 与 DeepSeek 实现同一接口。
 * 网络 provider 仅经 provider-factory 内部构造（UI 不得直连 provider）。
 */
export interface AnalysisProvider {
  readonly name: string;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}

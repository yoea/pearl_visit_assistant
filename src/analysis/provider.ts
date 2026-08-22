import type { AnalysisRequest } from '../types/student';

/** 分析结果契约：只输出分析/核实/建议，严禁「通过/淘汰」类结论 */
export interface DifficultyFactor {
  label: string;
  weight: number; // 越大越重要
  evidence: string;
}

export interface StudentInterviewGuide {
  anonymousId: string;
  basicInfo: { label: string; value: string }[];
  reasonSummary: string;
  familySummary: string;
  difficultyFactors: DifficultyFactor[];
  verificationPoints: string[];
  suggestedQuestions: string[];
  cautions: string[];
}

export interface SchoolOverview {
  studentCount: number;
  difficultyDistribution: Record<string, number>;
  lowIncomeCount: number;
  lowIncomeRatio: number; // 0-1
  majorIllnessCount: number;
  singleParentOrWeakLaborCount: number;
  highDebtCount: number;
  rentalCount: number;
  longDistanceCount: number;
  completeness: {
    totalFields: number;
    perStudent: { anonymousId: string; missingCount: number }[];
    averageMissing: number;
  };
  focusStudentIds: string[];
  suggestions: string[];
}

export interface AnalysisResult {
  school: SchoolOverview;
  students: StudentInterviewGuide[];
}

/**
 * 分析提供者接口。v1 用 MockAnalysisProvider；
 * 未来 DeepSeekAnalysisProvider 实现同一接口（API 地址用户配置，Key 绝不写死在源码）。
 */
export interface AnalysisProvider {
  readonly name: string;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}

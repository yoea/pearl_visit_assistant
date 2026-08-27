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

/** 一次完整分析的 token 用量（DeepSeek usage 字段；仅计数数字，不含任何学生数据） */
export interface TokenUsage {
  /** API 调用次数（分批每批一次；client 内部 JSON 修复重试的额外调用也计入） */
  apiCalls: number;
  /** 输入 token（system 提示词 + 学生数据 JSON） */
  promptTokens: number;
  /** 输出 token（模型生成的报告） */
  completionTokens: number;
  /** 输入缓存命中 token（DeepSeek 上下文缓存；缺省 0） */
  cacheHitTokens: number;
}

export interface AnalysisResult {
  schoolAnalysis: SchoolAnalysis;
  students: StudentAnalysis[];
  /** 仅真实 AI（DeepSeek）返回：全部 API 调用的 token 用量合计；mock 本地规则引擎为 undefined */
  usage?: TokenUsage;
}

/**
 * 分析提供者接口。Mock 与 DeepSeek 实现同一接口。
 * 网络 provider 仅经 provider-factory 内部构造（UI 不得直连 provider）。
 */
export interface AnalysisProvider {
  readonly name: string;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}

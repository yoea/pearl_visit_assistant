import { z } from 'zod';
import type { AnalysisRequest, AnonymizedStudent } from '../types/student';
import { scanPayload, type SecurityScanResult } from '../security/scanner';
import { IMPORTANCE_VALUES } from './provider';

export const PROTOCOL_VERSION = '1.0' as const;

/**
 * 出站白名单字段：AnonymizedStudent 的 34 个数据字段（显式列出）。
 * createAnalysisPayload 只拷贝这些键——未来 AnonymizedStudent 新增字段不会自动出站。
 */
export const SENT_FIELDS = [
  'gender', 'ethnicity', 'householdType', 'height', 'weight', 'healthStatus',
  'difficultyLevel', 'enrollmentStatus', 'province', 'city', 'county', 'ancestralHome',
  'distanceToSchoolKm', 'zhongkaoFullScore', 'zhongkaoScore', 'admissionRankBand',
  'gradeSize', 'familySituation', 'visitMethod', 'visitSummary', 'awardsAndInterests',
  'applicationReason', 'approvalComment', 'housingStatus', 'transportation',
  'annualIncome', 'annualIncomeNote', 'perCapitaIncome', 'schoolChildrenCount',
  'difficultyReason', 'elderlySupportStatus', 'elderlySupportNote', 'debtStatus', 'debtNote',
] as const satisfies ReadonlyArray<keyof AnonymizedStudent>;

// 编译期不变量：恰 34 个字段，且覆盖 AnonymizedStudent 除 anonymousId 外全部字段
type FieldCountIs34 = (typeof SENT_FIELDS)['length'] extends 34 ? true : never;
type FieldsCovered = Exclude<keyof AnonymizedStudent, 'anonymousId'> extends (typeof SENT_FIELDS)[number] ? true : never;
export const _sentFieldsConsistency: FieldCountIs34 & FieldsCovered = true;

export type WireStudentData = { [K in (typeof SENT_FIELDS)[number]]: AnonymizedStudent[K] };

export interface WireAnalysisRequest {
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  school: { name: string; totalStudents: number };
  cohort: string;
  students: { id: string; data: WireStudentData }[];
}

/**
 * 唯一出站构造点：AnalysisRequest → wire 请求。
 * 只拷贝 SENT_FIELDS 白名单字段；调用方必须先经过 AnalysisService 硬闸。
 * totalStudents：全校申请总人数——分批模式下每批仍是全量数，学校级归纳按全校视角撰写。
 */
export function createAnalysisPayload(
  request: AnalysisRequest, requestId: string, totalStudents?: number,
): WireAnalysisRequest {
  return {
    version: PROTOCOL_VERSION,
    requestId,
    school: { name: request.meta.schoolName, totalStudents: totalStudents ?? request.students.length },
    cohort: request.meta.cohort,
    students: request.students.map((s) => ({
      id: s.anonymousId,
      data: Object.fromEntries(SENT_FIELDS.map((k) => [k, s[k]])) as WireStudentData,
    })),
  };
}

/**
 * 出站终扫③：对最终 wire 结构做规则 + 禁止字段名 + 结构守卫。
 * school.name 豁免地址子句检测（与第一阶段 schoolName 豁免语义一致），其余规则照常。
 * requestId 为系统生成的随机 UUID（非用户数据），完全豁免规则扫描——避免偶发命中手机号/固话数字模式误拦。
 */
export function scanOutboundPayload(payload: WireAnalysisRequest): SecurityScanResult {
  return scanPayload(payload, new Set(), {
    exemptAddressPaths: ['school.name'],
    exemptRulePaths: ['requestId'],
  });
}

// ── 响应契约（zod）──────────────────────────────────────────────

export const importanceSchema = z.enum(IMPORTANCE_VALUES);

export const difficultyFactorSchema = z.object({
  factor: z.string().min(1),
  evidence: z.string().min(1),
  importance: importanceSchema,
});

export const studentAnalysisSchema = z.object({
  studentId: z.string().min(1),
  summary: z.string(),
  familySituation: z.string(),
  mainDifficultyFactors: z.array(difficultyFactorSchema),
  informationToVerify: z.array(z.string()),
  interviewQuestions: z.array(z.string()).min(5).max(8),
  interviewNotes: z.array(z.string()),
});

export const schoolAnalysisSchema = z.object({
  overview: z.string().min(1),
  studentCount: z.number().int().nonnegative(),
  difficultyPatterns: z.array(z.string()),
  commonIssues: z.array(z.string()),
  dataQualityIssues: z.array(z.string()),
  keyVerificationTopics: z.array(z.string()),
  interviewSuggestions: z.array(z.string()),
});

/** 响应契约：非严格模式（未知多余键忽略），version 恒为 1.0 */
export const wireResponseSchema = z.object({
  version: z.literal(PROTOCOL_VERSION),
  schoolAnalysis: schoolAnalysisSchema,
  students: z.array(studentAnalysisSchema),
});

export type WireAnalysisResponse = z.infer<typeof wireResponseSchema>;

// ── JSON 修复（只修一次）────────────────────────────────────────

/** 提取文本中第一个平衡的 {...} 块（含字符串内花括号处理）；无则 null */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** markdown 围栏剥离（```json 或 ```） */
export function stripFences(text: string): string {
  return text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1');
}

/**
 * 响应文本解析：直接 JSON.parse；失败则剥围栏 + 提取首个 {...} 修复一次。
 * 仍失败返回 null（调用方必须按「结果格式错误」处理，绝不静默吞掉）。
 */
export function parseResponseText(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // 落入修复一次
  }
  const repaired = extractJsonObject(stripFences(text));
  if (repaired === null) return null;
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

// 核心数据类型。安全不变量：AnonymizedStudent 类型上不存在任何敏感字段
// （姓名/身份证/电话/QQ/微信/邮箱/详细地址/珍珠号/教师姓名），编译期即无法写入 payload。

export type CellValue = string | number | boolean | null;

/** 解析出的原始行：仅存在于受控 RawStore */
export interface RawStudentRecord {
  sourceRow: number; // 数据所在工作表行号（从 1 开始）
  values: Record<string, CellValue>; // key = 原始表头名
}

export type FieldAction =
  | { action: 'drop'; reason: 'identity' | 'third-party' | 'internal' | 'unknown' }
  | { action: 'keep' }
  | { action: 'scrub' }
  | { action: 'generalize'; kind: 'rank-band' };

/** 一列（一个字段）的映射结果 */
export interface MappedColumn {
  header: string; // 原始表头名
  normalizedHeader: string;
  canonicalKey: string | null; // null = 未知字段（不发送）
  action: FieldAction;
}

/** 脱敏后的学生：发送给 AI 的唯一学生数据结构 */
export interface AnonymizedStudent {
  anonymousId: string; // student-001 …
  gender: string | null;
  ethnicity: string | null; // 民族
  householdType: string | null; // 户口
  height: string | null;
  weight: string | null;
  healthStatus: string | null;
  difficultyLevel: string | null; // 困难度
  enrollmentStatus: string | null; // 就读状态
  province: string | null;
  city: string | null;
  county: string | null;
  ancestralHome: string | null; // 籍贯
  distanceToSchoolKm: number | null;
  zhongkaoFullScore: number | null;
  zhongkaoScore: number | null;
  admissionRankBand: string | null; // 排名已泛化为区间
  gradeSize: number | null;
  familySituation: string | null; // 已清洗
  visitMethod: string | null;
  visitSummary: string | null; // 已清洗
  awardsAndInterests: string | null; // 已清洗
  applicationReason: string | null; // 已清洗
  approvalComment: string | null; // 已清洗
  housingStatus: string | null;
  transportation: string | null;
  annualIncome: number | null;
  annualIncomeNote: string | null; // 已清洗
  perCapitaIncome: number | null;
  schoolChildrenCount: number | null;
  difficultyReason: string | null; // 已清洗
  elderlySupportStatus: string | null;
  elderlySupportNote: string | null; // 已清洗
  debtStatus: string | null;
  debtNote: string | null; // 已清洗
}

export interface AnonymizationStats {
  rawStudentCount: number;
  rawFieldCount: number;
  sensitiveFieldCount: number; // identity + third-party 删除字段数
  droppedFieldCount: number; // 全部删除字段数
  generalizedFieldCount: number;
  sentFieldCount: number; // 最终发送字段数（keep + scrub + generalize）
}

export interface AnonymizationOutput {
  students: AnonymizedStudent[];
  stats: AnonymizationStats;
  /** anonymousId → 真实姓名。仅内存本地查询用，绝不进入 payload、绝不序列化 */
  nameIndex: Map<string, string>;
}

/** 发送给 AI 的完整请求 */
export interface AnalysisRequest {
  meta: { schoolName: string; cohort: string };
  students: AnonymizedStudent[];
}

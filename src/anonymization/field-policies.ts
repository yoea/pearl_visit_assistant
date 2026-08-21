import type { AnonymizedStudent, FieldAction } from '../types/student';

/** 规范化字段 key：与 AnonymizedStudent 属性名一一对应 */
export type CanonicalKey =
  | 'gender' | 'ethnicity' | 'householdType' | 'height' | 'weight' | 'healthStatus'
  | 'difficultyLevel' | 'enrollmentStatus' | 'province' | 'city' | 'county' | 'ancestralHome'
  | 'distanceToSchoolKm' | 'zhongkaoFullScore' | 'zhongkaoScore' | 'admissionRank'
  | 'gradeSize' | 'familySituation' | 'visitMethod' | 'visitSummary' | 'awardsAndInterests'
  | 'applicationReason' | 'approvalComment' | 'housingStatus' | 'transportation'
  | 'annualIncome' | 'annualIncomeNote' | 'perCapitaIncome' | 'schoolChildrenCount'
  | 'difficultyReason' | 'elderlySupportStatus' | 'elderlySupportNote' | 'debtStatus' | 'debtNote';

interface PolicyEntry {
  aliases: string[]; // 归一化后的表头别名
  action: FieldAction;
}

/** 字段策略表：已与用户逐项确认（设计文档第 5 节） */
export const FIELD_POLICIES: Record<CanonicalKey, PolicyEntry> = {
  gender: { aliases: ['性别'], action: { action: 'keep' } },
  ethnicity: { aliases: ['民族'], action: { action: 'keep' } },
  householdType: { aliases: ['户口'], action: { action: 'keep' } },
  height: { aliases: ['身高'], action: { action: 'keep' } },
  weight: { aliases: ['体重'], action: { action: 'keep' } },
  healthStatus: { aliases: ['健康情况'], action: { action: 'keep' } },
  difficultyLevel: { aliases: ['困难度'], action: { action: 'keep' } },
  enrollmentStatus: { aliases: ['就读状态'], action: { action: 'keep' } },
  province: { aliases: ['住址省'], action: { action: 'keep' } },
  city: { aliases: ['州市'], action: { action: 'keep' } },
  county: { aliases: ['县区'], action: { action: 'keep' } },
  ancestralHome: { aliases: ['籍贯'], action: { action: 'keep' } },
  distanceToSchoolKm: { aliases: ['距离高中路程'], action: { action: 'keep' } },
  zhongkaoFullScore: { aliases: ['中考满分'], action: { action: 'keep' } },
  zhongkaoScore: { aliases: ['中考成绩'], action: { action: 'keep' } },
  admissionRank: { aliases: ['录取高中全校排名'], action: { action: 'generalize', kind: 'rank-band' } },
  gradeSize: { aliases: ['全年级人数'], action: { action: 'keep' } },
  familySituation: { aliases: ['家庭情况'], action: { action: 'scrub' } },
  visitMethod: { aliases: ['家访方式'], action: { action: 'keep' } },
  visitSummary: { aliases: ['家访总结'], action: { action: 'scrub' } },
  awardsAndInterests: { aliases: ['获奖经历及兴趣爱好'], action: { action: 'scrub' } },
  applicationReason: { aliases: ['申请理由'], action: { action: 'scrub' } },
  approvalComment: { aliases: ['审批意见'], action: { action: 'scrub' } },
  housingStatus: { aliases: ['住房状况'], action: { action: 'keep' } },
  transportation: { aliases: ['交通工具'], action: { action: 'keep' } },
  annualIncome: { aliases: ['年收入'], action: { action: 'keep' } },
  annualIncomeNote: { aliases: ['年收入说明'], action: { action: 'scrub' } },
  perCapitaIncome: { aliases: ['人均年收入'], action: { action: 'keep' } },
  schoolChildrenCount: { aliases: ['上学子女人数'], action: { action: 'keep' } },
  difficultyReason: { aliases: ['困难原因'], action: { action: 'scrub' } },
  elderlySupportStatus: { aliases: ['需赡养老人情况'], action: { action: 'keep' } },
  elderlySupportNote: { aliases: ['需赡养老人情况说明'], action: { action: 'scrub' } },
  debtStatus: { aliases: ['负债情况'], action: { action: 'keep' } },
  debtNote: { aliases: ['负债情况说明'], action: { action: 'scrub' } },
};

/** 直接身份信息别名：必须删除（即使字段名变化也按别名匹配） */
export const FORBIDDEN_IDENTITY_ALIASES: string[] = [
  '珍珠生姓名', '姓名', '学生姓名', '身份证号', '身份证', '电话', '手机号', '手机', '联系方式',
  'qq', '微信号', '微信', '邮箱', '电子邮箱', '详细地址', '家庭住址', '住址', '地址', '珍珠号',
];

/** 第三方姓名别名：必须删除 */
export const THIRD_PARTY_ALIASES: string[] = ['家访教师姓名', '家访教师', '审批人', '结对捐方'];

/** 姓名承载列别名（身份姓名 + 第三方姓名）：黑名单提取与扫描器共用，避免双源漂移 */
export const NAME_BEARING_ALIASES: string[] = [
  '珍珠生姓名', '姓名', '学生姓名', '家访教师姓名', '家访教师', '审批人', '结对捐方',
];

/** 内部编号/常量字段：删除（学校名称与期数在解析器中提取为请求元数据） */
export const INTERNAL_ALIASES: string[] = [
  '序号', '学校编号', '珍珠班名称', '珍珠班编号', '资助项目名称', '出资方类型', '拨款金额',
  '期数', '状态', '就读状态变更时间', '就读状态变更原因', '结对要求', '资金池名称',
  '初中就读学校', '学校名称',
];

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '');
}

export function classifyHeader(header: string): { canonicalKey: CanonicalKey | null; action: FieldAction } {
  const h = normalizeHeader(header);
  // 删除表优先（fail-safe）：即使未来误将「姓名」等身份别名加进策略表，
  // 也绝不会 fail-open 把敏感字段保留并发送。四表当前零交集，行为与原顺序等价。
  if (FORBIDDEN_IDENTITY_ALIASES.includes(h)) {
    return { canonicalKey: null, action: { action: 'drop', reason: 'identity' } };
  }
  if (THIRD_PARTY_ALIASES.includes(h)) {
    return { canonicalKey: null, action: { action: 'drop', reason: 'third-party' } };
  }
  if (INTERNAL_ALIASES.includes(h)) {
    return { canonicalKey: null, action: { action: 'drop', reason: 'internal' } };
  }
  for (const [key, entry] of Object.entries(FIELD_POLICIES)) {
    if (entry.aliases.includes(h)) return { canonicalKey: key as CanonicalKey, action: entry.action };
  }
  return { canonicalKey: null, action: { action: 'drop', reason: 'unknown' } };
}

/** 是否已知字段名（供表头行检测打分） */
export function isKnownHeaderName(header: string): boolean {
  const { action } = classifyHeader(header);
  return !(action.action === 'drop' && action.reason === 'unknown');
}

// ── 仅编译期的类型一致性检查（Task 2 质量审查 #1，控制器授权）────────────────
// 用途：锁定 CanonicalKey 与 AnonymizedStudent 属性名的双向一致，避免策略表与数据模型漂移。
// 一致性检查：CanonicalKey 必须落在 AnonymizedStudent 属性名上。
// 例外：'admissionRank' 是来源列 key，脱敏后写入 AnonymizedStudent.admissionRankBand（由 Task 7 处理）。
type CanonicalKeyInStudent = CanonicalKey extends keyof AnonymizedStudent | 'admissionRank' ? true : never;
// 反向检查：AnonymizedStudent 除合成字段（anonymousId/admissionRankBand）外，每个字段都必须有对应策略。
type StudentFieldsCovered = Exclude<keyof AnonymizedStudent, 'anonymousId' | 'admissionRankBand'> extends CanonicalKey ? true : never;

export const _canonicalKeyConsistency: CanonicalKeyInStudent & StudentFieldsCovered = true;

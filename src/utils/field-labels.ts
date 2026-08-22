import type { AnonymizedStudent, FieldAction } from '../types/student';

/** 策略中文标签（UI 展示用） */
export const ACTION_LABELS: Record<FieldAction['action'], string> = {
  keep: '保留',
  scrub: '保留（文本清洗）',
  generalize: '泛化',
  drop: '不发送',
};

type DropReason = Extract<FieldAction, { action: 'drop' }>['reason'];

/** 删除原因中文标签：键集与 drop reason 联合类型编译期锁定 */
export const DROP_REASON_LABELS: Record<DropReason, string> = {
  identity: '身份信息',
  'third-party': '第三方姓名',
  internal: '内部字段',
  unknown: '未知字段',
};

/** 匿名学生字段中文标签（预览与报告用）：键集与 AnonymizedStudent 编译期锁定（35 键不变量） */
export const STUDENT_FIELD_LABELS: Record<keyof AnonymizedStudent, string> = {
  anonymousId: '匿名编号',
  gender: '性别', ethnicity: '民族', householdType: '户口', height: '身高',
  weight: '体重', healthStatus: '健康情况', difficultyLevel: '困难度',
  enrollmentStatus: '就读状态', province: '住址省', city: '州市', county: '县区',
  ancestralHome: '籍贯', distanceToSchoolKm: '距校路程(公里)', zhongkaoFullScore: '中考满分',
  zhongkaoScore: '中考成绩', admissionRankBand: '年级排名（区间）', gradeSize: '全年级人数',
  familySituation: '家庭情况', visitMethod: '家访方式', visitSummary: '家访总结',
  awardsAndInterests: '获奖经历及兴趣爱好', applicationReason: '申请理由',
  approvalComment: '审批意见', housingStatus: '住房状况', transportation: '交通工具',
  annualIncome: '年收入(元)', annualIncomeNote: '年收入说明', perCapitaIncome: '人均年收入(元)',
  schoolChildrenCount: '上学子女人数', difficultyReason: '困难原因',
  elderlySupportStatus: '需赡养老人情况', elderlySupportNote: '需赡养老人情况说明',
  debtStatus: '负债情况', debtNote: '负债情况说明',
};

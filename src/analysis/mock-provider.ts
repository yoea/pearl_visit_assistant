import type { AnalysisRequest, AnonymizedStudent } from '../types/student';
import type {
  AnalysisProvider, AnalysisResult, DifficultyFactor, Importance,
  SchoolAnalysis, StudentAnalysis,
} from './provider';
import { hasDebt, hasElderly, hasIllness, hasRental, selectQuestions } from './question-templates';
import { SENT_FIELDS } from './payload';

const LOW_INCOME_THRESHOLD = 10000; // 人均年收入阈值（元）
const LONG_DISTANCE_KM = 5;
const FOCUS_FACTOR_THRESHOLD = 3;
const SENT_FIELD_COUNT = SENT_FIELDS.length; // AnonymizedStudent 字段数（不含 anonymousId）

const WEAK_LABOR_KEYWORDS = /弱劳动|劳动能力弱|劳动能力不足|无劳动能力|残疾|患病|不能劳动|重病/;
const SINGLE_PARENT_KEYWORDS = /单亲|离异|离世|去世|亡故|独自抚养|母亲独自|父亲独自/;
const DEBT_KEYWORDS = /负债|欠款|借款|贷款|外债|还债/;

const narrativeText = (s: AnonymizedStudent): string =>
  [
    s.familySituation, s.visitSummary, s.applicationReason, s.approvalComment,
    s.difficultyReason, s.elderlySupportNote, s.debtNote, s.annualIncomeNote,
    s.awardsAndInterests,
  ]
    .filter(Boolean)
    .join('，');

const isLowIncome = (s: AnonymizedStudent): boolean =>
  s.perCapitaIncome != null && s.perCapitaIncome < LOW_INCOME_THRESHOLD;
const isLongDistance = (s: AnonymizedStudent): boolean =>
  (s.distanceToSchoolKm ?? 0) > LONG_DISTANCE_KM;
const isHighDebt = (s: AnonymizedStudent): boolean => hasDebt(s) || DEBT_KEYWORDS.test(narrativeText(s));
const isIllness = (s: AnonymizedStudent): boolean => hasIllness(s);
const isSingleParentOrWeakLabor = (s: AnonymizedStudent): boolean =>
  SINGLE_PARENT_KEYWORDS.test(narrativeText(s)) || WEAK_LABOR_KEYWORDS.test(narrativeText(s));

const excerpt = (t: string | null, max = 80): string => {
  if (!t) return '';
  const trimmed = t.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}……` : trimmed;
};

/** importance 映射：weight ≥3 → high，2 → medium，1 → low（8 因素表权重已按此设计） */
const toImportance = (weight: number): Importance =>
  weight >= 3 ? 'high' : weight === 2 ? 'medium' : 'low';

/** 8 因素单一定义源：学校级与学生级共用 label/hit/evidence/topic（防双表漂移） */
interface FactorDef {
  label: string;
  weight: number;
  hit: (s: AnonymizedStudent) => boolean;
  schoolEvidence: string;
  studentEvidence: (s: AnonymizedStudent) => string;
  /** 学校级核实主题；无对应学生级核实点的因素为 null */
  topic: string | null;
}

const FACTOR_DEFS: FactorDef[] = [
  {
    label: '重大疾病', weight: 5, hit: isIllness, topic: null,
    schoolEvidence: '材料提及疾病/治疗情况',
    studentEvidence: (s) => excerpt(s.familySituation) || excerpt(s.difficultyReason),
  },
  {
    label: '家庭负债', weight: 4, hit: isHighDebt, topic: '负债形成原因与当前还款压力',
    schoolEvidence: '材料显示存在负债',
    studentEvidence: (s) => excerpt(s.debtNote) || (s.debtStatus ?? ''),
  },
  {
    label: '单亲/弱劳动能力', weight: 4, hit: isSingleParentOrWeakLabor,
    topic: '家庭实际劳动力与收入支撑情况',
    schoolEvidence: '材料提及家庭劳动力不足',
    studentEvidence: (s) => excerpt(s.visitSummary) || excerpt(s.difficultyReason),
  },
  {
    label: '低收入', weight: 3, hit: isLowIncome, topic: '家庭收入来源与日常开支',
    schoolEvidence: '人均年收入低于参考线',
    studentEvidence: (s) => `人均年收入${s.perCapitaIncome!}元`,
  },
  {
    label: '多子女上学', weight: 2, hit: (s) => (s.schoolChildrenCount ?? 0) >= 2,
    topic: '实际共同生活人口与在读子女情况',
    schoolEvidence: '上学子女人数较多',
    studentEvidence: (s) => `上学子女${s.schoolChildrenCount ?? 0}人`,
  },
  {
    label: '赡养老人', weight: 2, hit: hasElderly, topic: null,
    schoolEvidence: '有需赡养老人',
    studentEvidence: (s) => excerpt(s.elderlySupportNote) || (s.elderlySupportStatus ?? ''),
  },
  {
    label: '租房陪读', weight: 1, hit: hasRental, topic: '住房、租金与陪读情况',
    schoolEvidence: '租房居住',
    studentEvidence: (s) => s.housingStatus ?? '',
  },
  {
    label: '远距通学', weight: 1, hit: isLongDistance, topic: '往返学校的频率与交通成本',
    schoolEvidence: '距离学校较远',
    studentEvidence: (s) => `距校${s.distanceToSchoolKm ?? 0}公里`,
  },
];

const toFactors = (
  s: AnonymizedStudent,
  evidenceOf: (d: FactorDef) => string,
): DifficultyFactor[] =>
  FACTOR_DEFS
    .filter((d) => d.hit(s))
    .map((d) => ({ factor: d.label, evidence: evidenceOf(d), importance: toImportance(d.weight) }));

/** 困难类型分布：优先用困难度字段，空则按关键词分类 */
function difficultyDistribution(students: AnonymizedStudent[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const s of students) {
    const level = (s.difficultyLevel ?? '').trim();
    if (level) {
      dist[level] = (dist[level] ?? 0) + 1;
      continue;
    }
    const tags: string[] = [];
    if (isIllness(s)) tags.push('疾病家庭');
    if (isSingleParentOrWeakLabor(s)) tags.push('单亲/弱劳动');
    if (isLowIncome(s)) tags.push('低收入');
    if (isHighDebt(s)) tags.push('负债');
    if (hasElderly(s)) tags.push('赡养老人');
    if ((s.schoolChildrenCount ?? 0) >= 2) tags.push('多子女上学');
    const key = tags.length > 0 ? tags.join('+') : '未识别';
    dist[key] = (dist[key] ?? 0) + 1;
  }
  return dist;
}

function missingFieldCount(s: AnonymizedStudent): number {
  const { anonymousId: _id, ...rest } = s;
  return Object.values(rest).filter((v) => v == null || v === '').length;
}

function buildSchoolAnalysis(students: AnonymizedStudent[]): SchoolAnalysis {
  const lowIncome = students.filter(isLowIncome).length;
  const majorIllness = students.filter(isIllness).length;
  const singleWeak = students.filter(isSingleParentOrWeakLabor).length;
  const highDebt = students.filter(isHighDebt).length;
  const rental = students.filter(hasRental).length;
  const longDistance = students.filter(isLongDistance).length;
  const focusIds = students
    .filter((s) => toFactors(s, (d) => d.schoolEvidence).length >= FOCUS_FACTOR_THRESHOLD)
    .map((s) => s.anonymousId);

  const difficultyPatterns = Object.entries(difficultyDistribution(students))
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}：${v}人`);

  const commonIssues: string[] = [];
  if (lowIncome > 0) {
    const ratio = students.length > 0 ? ((lowIncome / students.length) * 100).toFixed(1) : '0.0';
    commonIssues.push(`低收入家庭 ${lowIncome} 人，占 ${ratio}%`);
  }
  if (highDebt > 0) commonIssues.push(`存在负债情况的家庭 ${highDebt} 个`);
  if (rental > 0) commonIssues.push(`租房居住的家庭 ${rental} 个`);
  if (longDistance > 0) commonIssues.push(`距校较远（超过 ${LONG_DISTANCE_KM} 公里）的学生 ${longDistance} 人`);
  const avgMissing = students.length > 0
    ? students.reduce((sum, s) => sum + missingFieldCount(s), 0) / students.length
    : 0;
  if (avgMissing > 5) commonIssues.push('部分学生材料填写不完整，面谈时可补充了解');

  const dataQualityIssues = students
    .map((s) => ({ id: s.anonymousId, missing: missingFieldCount(s) }))
    .filter((p) => p.missing > 0)
    .map((p) => `${p.id} 材料缺失 ${p.missing}/${SENT_FIELD_COUNT} 项`);

  const keyVerificationTopics = FACTOR_DEFS
    .filter((d) => d.topic !== null && students.some((d2) => d.hit(d2)))
    .map((d) => d.topic as string);

  return {
    overview: [
      `本校共 ${students.length} 名候选学生。`,
      `低收入家庭 ${lowIncome} 人，重大疾病家庭 ${majorIllness} 个，单亲/弱劳动能力家庭 ${singleWeak} 个，高负债家庭 ${highDebt} 个，租房家庭 ${rental} 个，远距通学 ${longDistance} 人。`,
      focusIds.length > 0
        ? `困难因素较多、建议重点约见的学生：${focusIds.join('、')}。`
        : '暂无困难因素明显偏多的学生。',
    ].join(''),
    studentCount: students.length,
    difficultyPatterns,
    commonIssues,
    dataQualityIssues,
    keyVerificationTopics,
    interviewSuggestions: [
      '建议面谈前先浏览全校整体情况，重点约见困难因素较多的学生',
      '对材料信息缺失较多的学生，面谈时可适当多花时间了解',
      '关注材料中收入、疾病、负债等描述的一致性',
    ],
  };
}

function buildStudentAnalysis(s: AnonymizedStudent): StudentAnalysis {
  const informationToVerify: string[] = [];
  if (isLowIncome(s) && !s.annualIncomeNote) {
    informationToVerify.push('申请材料显示家庭年收入较低，但收入来源描述不够清晰，建议面谈时了解主要收入来源。');
  }
  if ((s.schoolChildrenCount ?? 0) >= 2) {
    informationToVerify.push('家庭成员较多，建议确认实际共同生活人口与在读子女情况。');
  }
  if (isHighDebt(s) && !s.debtNote) {
    informationToVerify.push('材料显示存在负债，建议了解负债形成原因与当前还款压力。');
  }
  if (hasRental(s)) {
    informationToVerify.push('建议确认当前住房、租金与陪读情况。');
  }
  if (isLongDistance(s)) {
    informationToVerify.push('建议了解往返学校的实际频率与交通成本。');
  }
  if (isSingleParentOrWeakLabor(s)) {
    informationToVerify.push('材料提及家庭劳动力不足，建议了解实际劳动力与收入支撑情况。');
  }

  const interviewNotes: string[] = [];
  if (isIllness(s)) {
    interviewNotes.push('该生材料涉及家人健康问题，建议采用开放式提问，避免直接带入结论，注意保护学生自尊。');
  }
  if (isHighDebt(s)) {
    interviewNotes.push('涉及负债话题时建议语气缓和，先了解整体开支情况，不直接追问债务细节。');
  }

  return {
    studentId: s.anonymousId,
    summary: excerpt(s.applicationReason, 120) || '材料中未填写申请理由。',
    familySituation:
      [
        s.householdType ? `户口类型${s.householdType}` : null,
        s.annualIncome != null ? `家庭年收入约${s.annualIncome}元` : null,
        s.perCapitaIncome != null ? `人均年收入${s.perCapitaIncome}元` : null,
        s.housingStatus ? `住房：${s.housingStatus}` : null,
        s.schoolChildrenCount != null ? `上学子女${s.schoolChildrenCount}人` : null,
        s.elderlySupportStatus ? `赡养老人：${s.elderlySupportStatus}` : null,
        s.debtStatus ? `负债：${s.debtStatus}` : null,
        s.visitSummary ? `家访记录：${excerpt(s.visitSummary, 100)}` : null,
      ]
        .filter(Boolean)
        .join('。') || '材料中未填写家庭情况。',
    mainDifficultyFactors: toFactors(s, (d) => d.studentEvidence(s)),
    informationToVerify,
    interviewQuestions: selectQuestions(s),
    interviewNotes,
  };
}

/**
 * Mock 分析器：确定性规则引擎，模拟 AI 分析。
 * 只输出分析/核实/建议，绝不输出「通过/淘汰」结论。
 */
export class MockAnalysisProvider implements AnalysisProvider {
  readonly name = 'mock';

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    return {
      schoolAnalysis: buildSchoolAnalysis(request.students),
      students: request.students.map(buildStudentAnalysis),
    };
  }
}

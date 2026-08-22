import type { AnalysisRequest, AnonymizedStudent } from '../types/student';
import type {
  AnalysisProvider, AnalysisResult, DifficultyFactor, SchoolOverview, StudentInterviewGuide,
} from './provider';
import { hasDebt, hasElderly, hasIllness, hasRental, selectQuestions } from './question-templates';

const LOW_INCOME_THRESHOLD = 10000; // 人均年收入阈值（元）
const LONG_DISTANCE_KM = 5;
const FOCUS_FACTOR_THRESHOLD = 3;
const SENT_FIELD_COUNT = 34; // AnonymizedStudent 字段数（不含 anonymousId），用于材料完整度

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

function buildSchoolOverview(students: AnonymizedStudent[]): SchoolOverview {
  const lowIncome = students.filter(isLowIncome).length;
  const factors = (s: AnonymizedStudent): DifficultyFactor[] =>
    [
      { label: '重大疾病', weight: 5, evidence: '材料提及疾病/治疗情况', hit: isIllness(s) },
      { label: '家庭负债', weight: 4, evidence: '材料显示存在负债', hit: isHighDebt(s) },
      { label: '单亲/弱劳动能力', weight: 4, evidence: '材料提及家庭劳动力不足', hit: isSingleParentOrWeakLabor(s) },
      { label: '低收入', weight: 3, evidence: '人均年收入低于参考线', hit: isLowIncome(s) },
      { label: '多子女上学', weight: 2, evidence: '上学子女人数较多', hit: (s.schoolChildrenCount ?? 0) >= 2 },
      { label: '赡养老人', weight: 2, evidence: '有需赡养老人', hit: hasElderly(s) },
      { label: '租房陪读', weight: 1, evidence: '租房居住', hit: hasRental(s) },
      { label: '远距通学', weight: 1, evidence: '距离学校较远', hit: isLongDistance(s) },
    ]
      .filter((f) => f.hit)
      .map(({ label, weight, evidence }) => ({ label, weight, evidence }));

  const perStudentMissing = students.map((s) => ({
    anonymousId: s.anonymousId,
    missingCount: missingFieldCount(s),
  }));
  const totalMissing = perStudentMissing.reduce((sum, p) => sum + p.missingCount, 0);

  return {
    studentCount: students.length,
    difficultyDistribution: difficultyDistribution(students),
    lowIncomeCount: lowIncome,
    lowIncomeRatio: students.length > 0 ? lowIncome / students.length : 0,
    majorIllnessCount: students.filter(isIllness).length,
    singleParentOrWeakLaborCount: students.filter(isSingleParentOrWeakLabor).length,
    highDebtCount: students.filter(isHighDebt).length,
    rentalCount: students.filter(hasRental).length,
    longDistanceCount: students.filter(isLongDistance).length,
    completeness: {
      totalFields: SENT_FIELD_COUNT,
      perStudent: perStudentMissing,
      averageMissing: students.length > 0 ? totalMissing / students.length : 0,
    },
    focusStudentIds: students.filter((s) => factors(s).length >= FOCUS_FACTOR_THRESHOLD).map((s) => s.anonymousId),
    suggestions: [
      '建议面谈前先浏览全校整体情况，重点约见困难因素较多的学生',
      '对材料信息缺失较多的学生，面谈时可适当多花时间了解',
      '关注材料中收入、疾病、负债等描述的一致性',
    ],
  };
}

function buildStudentGuide(s: AnonymizedStudent): StudentInterviewGuide {
  const basicInfo: { label: string; value: string }[] = ([
    ['性别', s.gender], ['民族', s.ethnicity], ['户口', s.householdType],
    ['健康情况', s.healthStatus], ['困难度', s.difficultyLevel],
    ['就读状态', s.enrollmentStatus],
    ['地区', [s.province, s.city, s.county].filter(Boolean).join('') || null],
    ['距校路程', s.distanceToSchoolKm != null ? `${s.distanceToSchoolKm}公里` : null],
    ['中考成绩', s.zhongkaoScore != null && s.zhongkaoFullScore != null ? `${s.zhongkaoScore}/${s.zhongkaoFullScore}` : null],
    ['年级排名', s.admissionRankBand],
    ['住房状况', s.housingStatus], ['交通工具', s.transportation],
    ['家庭年收入', s.annualIncome != null ? `${s.annualIncome}元` : null],
    ['人均年收入', s.perCapitaIncome != null ? `${s.perCapitaIncome}元` : null],
    ['上学子女人数', s.schoolChildrenCount != null ? `${s.schoolChildrenCount}人` : null],
    ['赡养老人', s.elderlySupportStatus], ['负债情况', s.debtStatus],
  ] as [string, string | null][])
    .filter(([, v]) => v != null && v !== '')
    .map(([label, value]) => ({ label, value: value as string }));

  const excerpt = (t: string | null, max = 80): string => {
    if (!t) return '';
    const trimmed = t.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max)}……` : trimmed;
  };

  const factors: DifficultyFactor[] = [
    { label: '重大疾病', weight: 5, evidence: excerpt(s.familySituation) || excerpt(s.difficultyReason), hit: isIllness(s) },
    { label: '家庭负债', weight: 4, evidence: excerpt(s.debtNote) || (s.debtStatus ?? ''), hit: isHighDebt(s) },
    { label: '单亲/弱劳动能力', weight: 4, evidence: excerpt(s.visitSummary) || excerpt(s.difficultyReason), hit: isSingleParentOrWeakLabor(s) },
    { label: '低收入', weight: 3, evidence: `人均年收入${s.perCapitaIncome ?? '未知'}元`, hit: isLowIncome(s) },
    { label: '多子女上学', weight: 2, evidence: `上学子女${s.schoolChildrenCount ?? 0}人`, hit: (s.schoolChildrenCount ?? 0) >= 2 },
    { label: '赡养老人', weight: 2, evidence: excerpt(s.elderlySupportNote) || (s.elderlySupportStatus ?? ''), hit: hasElderly(s) },
    { label: '租房陪读', weight: 1, evidence: s.housingStatus ?? '', hit: hasRental(s) },
    { label: '远距通学', weight: 1, evidence: `距校${s.distanceToSchoolKm ?? 0}公里`, hit: isLongDistance(s) },
  ]
    .filter((f) => f.hit)
    .map(({ label, weight, evidence }) => ({ label, weight, evidence }));

  const verificationPoints: string[] = [];
  if (isLowIncome(s) && !s.annualIncomeNote) {
    verificationPoints.push('申请材料显示家庭年收入较低，但收入来源描述不够清晰，建议面谈时了解主要收入来源。');
  }
  if ((s.schoolChildrenCount ?? 0) >= 2) {
    verificationPoints.push('家庭成员较多，建议确认实际共同生活人口与在读子女情况。');
  }
  if (isHighDebt(s) && !s.debtNote) {
    verificationPoints.push('材料显示存在负债，建议了解负债形成原因与当前还款压力。');
  }
  if (hasRental(s)) {
    verificationPoints.push('建议确认当前住房、租金与陪读情况。');
  }
  if (isLongDistance(s)) {
    verificationPoints.push('建议了解往返学校的实际频率与交通成本。');
  }
  if (isSingleParentOrWeakLabor(s)) {
    verificationPoints.push('材料提及家庭劳动力不足，建议了解实际劳动力与收入支撑情况。');
  }

  const cautions: string[] = [];
  if (isIllness(s)) {
    cautions.push('该生材料涉及家人健康问题，建议采用开放式提问，避免直接带入结论，注意保护学生自尊。');
  }
  if (isHighDebt(s)) {
    cautions.push('涉及负债话题时建议语气缓和，先了解整体开支情况，不直接追问债务细节。');
  }

  return {
    anonymousId: s.anonymousId,
    basicInfo,
    reasonSummary: excerpt(s.applicationReason, 120) || '材料中未填写申请理由。',
    familySummary:
      [
        s.householdType ? `户口类型${s.householdType}` : null,
        s.annualIncome != null ? `家庭年收入约${s.annualIncome}元` : null,
        s.perCapitaIncome != null ? `人均年收入${s.perCapitaIncome}元` : null,
        s.housingStatus ? `住房：${s.housingStatus}` : null,
        s.schoolChildrenCount != null ? `上学子女${s.schoolChildrenCount}人` : null,
        s.elderlySupportStatus ? `赡养老人：${s.elderlySupportStatus}` : null,
        s.debtStatus ? `负债：${s.debtStatus}` : null,
      ]
        .filter(Boolean)
        .join('，') + (s.visitSummary ? `。家访记录：${excerpt(s.visitSummary, 100)}` : ''),
    difficultyFactors: factors,
    verificationPoints,
    suggestedQuestions: selectQuestions(s),
    cautions,
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
      school: buildSchoolOverview(request.students),
      students: request.students.map(buildStudentGuide),
    };
  }
}

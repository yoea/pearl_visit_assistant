import type { AnonymizedStudent } from '../types/student';

export interface QuestionTemplate {
  id: string;
  text: string;
  /** 出现条件；不满足则跳过。null = 必问 */
  when: ((s: AnonymizedStudent) => boolean) | null;
  /** 优先级（越小越靠前） */
  priority: number;
}

/** 否定表述前缀：以「无/0/没有」开头的字段视为否定回答（三类谓词统一口径） */
const NEGATIVE_PREFIX = /^(无|0|没有)/;

/** 疾病词：正向语境（患病/生病/疾病/具体病种/治疗史），不含裸「病」字——避免「看病难」等中性表述误判 */
const ILLNESS_KEYWORDS =
  /癌|肿瘤|残疾|手术|住院|慢性|重症|心脏病|糖尿病|精神|瘫痪|尿毒症|白血病|中风|肝硬化|透析|患病|生病|得病|疾病|重病|大病|久病|病重/;

export function hasRental(s: AnonymizedStudent): boolean {
  return /租房|租住|出租/.test(s.housingStatus ?? '');
}
export function hasElderly(s: AnonymizedStudent): boolean {
  const v = (s.elderlySupportStatus ?? '').trim();
  if (v === '') return false;
  return !NEGATIVE_PREFIX.test(v);
}
export function hasDebt(s: AnonymizedStudent): boolean {
  const d = (s.debtStatus ?? '').trim();
  if (d === '') return false;
  // 前缀否定覆盖「无负债/无债务/无欠款/0/没有」等表述
  return !NEGATIVE_PREFIX.test(d);
}
export function hasIllness(s: AnonymizedStudent): boolean {
  // 否定前缀字段整体排除（如「无重大疾病」「没有病史」）；其余字段按正向疾病词匹配。
  // 已知局限：词内否定（如「家庭无疾病史」）不覆盖——规则引擎仅做前缀级近似，不追求全语义。
  const text = [s.healthStatus, s.familySituation, s.visitSummary, s.difficultyReason, s.elderlySupportNote, s.annualIncomeNote]
    .filter((f): f is string => f !== null && f !== '' && !NEGATIVE_PREFIX.test(f.trim()))
    .join('，');
  return ILLNESS_KEYWORDS.test(text);
}

/** 中性问题模板库：不诱导、不给结论、尊重学生 */
export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  { id: 'q-reason', text: '请问你是基于什么原因申请珍珠生呢？', when: null, priority: 1 },
  { id: 'q-income', text: '你方便介绍一下目前家里主要的经济来源吗？', when: (s) => s.annualIncomeNote == null, priority: 2 },
  { id: 'q-family', text: '请你介绍一下家里的情况，有没有兄弟姐妹，他们目前在上学还是工作？', when: null, priority: 3 },
  { id: 'q-siblings', text: '家里还有几位兄弟姐妹在上学？他们目前在哪里上学？', when: (s) => (s.schoolChildrenCount ?? 0) >= 2, priority: 4 },
  { id: 'q-elderly', text: '家中是否有老人需要照顾？他们目前身体状况如何？', when: hasElderly, priority: 5 },
  { id: 'q-housing', text: '目前住房是自建的还是租住的？方便介绍一下居住情况吗？', when: null, priority: 6 },
  { id: 'q-rent', text: '如果是租房，方便介绍一下租金和一起居住的人吗？', when: hasRental, priority: 7 },
  { id: 'q-distance', text: '你多久回家一次？往返路上大概需要多长时间、多少花费？', when: (s) => (s.distanceToSchoolKm ?? 0) > 5, priority: 8 },
  { id: 'q-living', text: '你现在住校吗？住宿和餐费是怎么安排的？', when: null, priority: 9 },
  { id: 'q-subsidy', text: '学校目前有哪些费用减免或补助？这些补助落实情况怎么样？', when: null, priority: 10 },
  { id: 'q-expense', text: '你每个月的生活开销大概是多少？主要用在哪些方面？', when: null, priority: 11 },
  { id: 'q-debt', text: '你方便介绍一下家里目前的支出和负担情况吗？', when: hasDebt, priority: 12 },
  { id: 'q-health', text: '家人的身体状况怎么样？平时的照顾情况如何？', when: hasIllness, priority: 13 },
  { id: 'q-learn', text: '你觉得自己目前的学习状态怎么样？有没有特别喜欢的科目？', when: null, priority: 14 },
  { id: 'q-class', text: '在班里有没有担任什么职务？和老师、同学的相处怎么样？', when: null, priority: 15 },
  { id: 'q-program', text: '你是怎么了解到捡回珍珠计划的？对它了解多少？', when: null, priority: 16 },
  { id: 'q-future', text: '你对未来有什么打算？有没有想过大学想读什么方向？', when: null, priority: 17 },
];

/** 按条件与优先级选 5-8 个问题（确定性） */
export function selectQuestions(s: AnonymizedStudent): string[] {
  const matched = QUESTION_TEMPLATES
    .filter((t) => t.when === null || t.when(s))
    .sort((a, b) => a.priority - b.priority);
  return matched.slice(0, 8).map((t) => t.text);
}

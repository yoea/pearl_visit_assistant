# 第二阶段：接入真实 AI 分析 API（DeepSeekAnalysisProvider）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏第一阶段安全架构的前提下，接入真实 AI 分析 API（DeepSeekAnalysisProvider），保留 MockAnalysisProvider 作为默认与回退路径。

**Architecture:** 四模块分层——deepseek-provider.ts（provider 重扫 → createAnalysisPayload → 出站终扫 → 交 client）、analysis-client.ts（唯一 fetch 出口，30s 超时，状态码分类，JSON 修复一次 + zod 校验）、payload.ts（协议类型 + zod schema + 唯一出站构造点）、provider-factory.ts（工厂内部构造网络 provider，网络类不公共导出）。三重扫描链：AnalysisService 硬闸（既有）→ provider 规则重扫 → 出站 payload 终扫。UI 在 scanned 阶段新增 confirm 视图子态（SendPreviewStep），不自动发送。

**Tech Stack:** React 19 + TypeScript 5.8 + Vite 7 + Vitest 3 + zod 3（已在 dependencies）+ @testing-library/react + jsdom（Task 9 新增 devDependencies）

**权威依据:** `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md`（用户已批准）。安全红线以该文档第 2 节为最高优先级；本计划与设计文档冲突时，以设计文档为准，并暂停向控制器上报。

**通用约定:**
- 工作目录：`D:\Develope\project\pearl_visit_assistant`，Windows Git Bash。
- 每步命令前如有测试/类型检查失败均视为步骤失败，先修再继续。
- 提交信息格式：`类型: 中文描述`（类型 = feat/fix/refactor/test/chore/docs），结尾追加 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 验证基线：每个任务结束时 `npm test` 全绿 + `npm run build` 通过（Task 1 的步骤 8/9 之前除外——结构迁移任务中途类型红属预期，见 Task 1 说明）。
- 现有测试基线 119 个；改造后数量会变化，以「全绿」为准，不硬编码总数。

---

### Task 1: 新结果结构迁移（provider 类型 + Mock 改造 + 报告模块 + 渲染）

**Files:**
- Modify: `src/analysis/provider.ts`（旧 SchoolOverview/StudentInterviewGuide 全删，换 SchoolAnalysis/StudentAnalysis）
- Modify: `src/analysis/mock-provider.ts`（映射改造，删除 basicInfo）
- Test: `tests/mock-provider.test.ts`（重写）、`tests/report.test.ts`（重写）、`tests/analysis-service.test.ts`（fakeResult 更新）
- Modify: `src/report/types.ts`、`src/report/generator.ts`、`src/report/markdown.ts`
- Modify: `src/components/ReportStep.tsx`（新结构渲染 + 本地基本信息表）
- Modify: `src/App.tsx`（generateReport 新签名一处调用）
- 不改：`src/analysis/question-templates.ts`（必问模板 10 个 + slice(0,8)，恒满足 5-8，无需改）

**说明:** 本任务为结构迁移，步骤 2-7 期间类型检查红属预期；步骤 8 全量验证后才算完成。以下代码块全部为最终形态，照抄即可。

- [ ] **Step 1: 确认 zod 就位**

```bash
npm install
node -e "import('zod').then(() => console.log('zod ok'))"
```
Expected: 输出 `zod ok`（zod 已在 package.json dependencies，此步保证 node_modules 同步）。

- [ ] **Step 2: 重写 tests/mock-provider.test.ts（新结构期望，含 zod 契约校验）**

整个文件替换为：

```ts
import { describe, it, expect } from 'vitest';
import { MockAnalysisProvider } from '../src/analysis/mock-provider';
import { PROTOCOL_VERSION, wireResponseSchema } from '../src/analysis/payload';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

function student(overrides: Partial<AnonymizedStudent> = {}): AnonymizedStudent {
  return {
    anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
    height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
    enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
    ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
    admissionRankBand: '15%-30%', gradeSize: 923,
    familySituation: '母亲患心脏病，劳动能力弱', visitMethod: '入户家访',
    visitSummary: '家庭收入来源单一', awardsAndInterests: '喜欢阅读',
    applicationReason: '家庭困难，希望减轻负担', approvalComment: null,
    housingStatus: '租房（年租金/元）/10000以下', transportation: '无以上类型车辆',
    annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
    schoolChildrenCount: 2, difficultyReason: '母亲心脏病，父亲务农',
    elderlySupportStatus: '4人', elderlySupportNote: '爷爷奶奶体弱',
    debtStatus: '5万元', debtNote: null,
    ...overrides,
  };
}

const requestWith = (students: AnonymizedStudent[]): AnalysisRequest => ({
  meta: { schoolName: '某中学', cohort: '2026级' },
  students,
});

describe('MockAnalysisProvider（新结构）', () => {
  it('学校级统计正确（overview/studentCount/difficultyPatterns）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([
      student(),
      student({ anonymousId: 'student-002', perCapitaIncome: 20000, familySituation: '健康', difficultyReason: '无', debtStatus: '无负债', housingStatus: '自建房', distanceToSchoolKm: 1, schoolChildrenCount: 1, elderlySupportStatus: null, elderlySupportNote: null }),
    ]));
    const sa = result.schoolAnalysis;
    expect(sa.studentCount).toBe(2);
    expect(sa.overview).toContain('本校共 2 名候选学生');
    expect(sa.overview).toContain('低收入家庭 1 人');
    expect(sa.overview).toContain('student-001');
    expect(sa.difficultyPatterns.length).toBeGreaterThan(0);
    expect(sa.difficultyPatterns.every((p) => /：\d+人$/.test(p))).toBe(true);
    expect(sa.interviewSuggestions.length).toBeGreaterThan(0);
  });

  it('学生级：困难因素 importance 映射与顺序（weight≥3→high 在前）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const factors = result.students[0].mainDifficultyFactors;
    expect(factors.length).toBeGreaterThan(0);
    const order = ['high', 'medium', 'low'];
    expect(factors.map((f) => f.importance)).toEqual(
      [...factors.map((f) => f.importance)].sort(
        (a, b) => order.indexOf(a) - order.indexOf(b),
      ),
    );
    expect(factors[0]).toMatchObject({ factor: '重大疾病', importance: 'high' });
    for (const f of factors) expect(f.evidence.length).toBeGreaterThan(0);
  });

  it('学生级：推荐问题 5-8 个，均为中性问题', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const qs = result.students[0].interviewQuestions;
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(8);
    for (const q of qs) {
      expect(q).not.toMatch(/是不是因为|一定|肯定|困难吗|可怜/);
    }
  });

  it('涉及疾病时给出面谈注意事项（interviewNotes）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    expect(result.students[0].interviewNotes.length).toBeGreaterThan(0);
  });

  it('输出不含结论性表述', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const json = JSON.stringify(result);
    expect(json).not.toContain('建议通过');
    expect(json).not.toContain('建议淘汰');
    expect(json).not.toContain('取消资格');
  });

  it('确定性：相同输入产生相同输出', async () => {
    const provider = new MockAnalysisProvider();
    const a = await provider.analyze(requestWith([student()]));
    const b = await provider.analyze(requestWith([student()]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('材料缺失被计入 dataQualityIssues', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const issues = result.schoolAnalysis.dataQualityIssues;
    expect(issues.length).toBeGreaterThan(0); // annualIncomeNote/approvalComment 等为 null
    expect(issues.some((i) => i.includes('student-001') && i.includes('/34'))).toBe(true);
  });

  it('学生级：未命中的因素不出现（健康/无负债学生不产生困难因素）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([
      student({
        anonymousId: 'student-002', perCapitaIncome: 20000, familySituation: '健康',
        difficultyReason: '无', debtStatus: '无负债', debtNote: null,
        housingStatus: '自建房', distanceToSchoolKm: 1, schoolChildrenCount: 1,
        elderlySupportStatus: null, elderlySupportNote: null,
        healthStatus: '健康', visitSummary: '家庭收入来源单一', annualIncomeNote: '务农',
      }),
    ]));
    expect(result.students[0].mainDifficultyFactors).toHaveLength(0);
  });

  it('家庭情况字段全缺省时给出占位文案（familySituation）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([
      student({
        anonymousId: 'student-002', householdType: null, annualIncome: null,
        perCapitaIncome: null, housingStatus: null, schoolChildrenCount: null,
        elderlySupportStatus: null, debtStatus: null, visitSummary: null,
      }),
    ]));
    expect(result.students[0].familySituation).toBe('材料中未填写家庭情况。');
  });

  it('学校级核实主题来自命中的因素（同源 FACTOR_DEFS）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const topics = result.schoolAnalysis.keyVerificationTopics;
    // 样本学生：低收入命中、远距命中（8km > 5km）、疾病命中但 topic 为 null
    expect(topics).toContain('家庭收入来源与日常开支');
    expect(topics).toContain('往返学校的频率与交通成本');
    expect(topics).not.toContain('重大疾病'); // 疾病因素无核实主题（topic: null）
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx vitest run tests/mock-provider.test.ts
```
Expected: FAIL——`payload` 模块不存在（Task 3 才建）、旧 provider 输出旧结构字段（`result.schoolAnalysis` undefined）。

- [ ] **Step 4: 改写 src/analysis/provider.ts（新结构类型）**

整个文件替换为：

```ts
import type { AnalysisRequest } from '../types/student';

/** 分析结果契约：只输出分析/核实/建议，严禁「通过/淘汰」类结论 */
export type Importance = 'high' | 'medium' | 'low';

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
```

- [ ] **Step 5: 改写 src/analysis/mock-provider.ts（映射改造）**

整个文件替换为：

```ts
import type { AnalysisRequest, AnonymizedStudent } from '../types/student';
import type {
  AnalysisProvider, AnalysisResult, DifficultyFactor, Importance,
  SchoolAnalysis, StudentAnalysis,
} from './provider';
import { hasDebt, hasElderly, hasIllness, hasRental, selectQuestions } from './question-templates';

const LOW_INCOME_THRESHOLD = 10000; // 人均年收入阈值（元）
const LONG_DISTANCE_KM = 5;
const FOCUS_FACTOR_THRESHOLD = 3;
const SENT_FIELD_COUNT = 34; // AnonymizedStudent 字段数（不含 anonymousId）

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
```

- [ ] **Step 6: 更新 tests/analysis-service.test.ts 的 fakeResult 为新结构**

替换文件第 19-28 行的 `fakeResult` 定义为：

```ts
const fakeResult: AnalysisResult = {
  schoolAnalysis: {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [],
};
```

其余用例（硬闸拦截/委托/透传等）保持不变——它们只依赖 AnalysisResult 类型与 provider stub。

- [ ] **Step 7: 改造报告模块（types/generator/markdown）**

`src/report/types.ts` 整个文件替换为：

```ts
import type { SchoolAnalysis, StudentAnalysis } from '../analysis/provider';
import type { AnonymizedStudent } from '../types/student';

export interface Report {
  title: string;
  schoolName: string;
  cohort: string;
  generatedAt: string; // YYYY-MM-DD HH:mm
  schoolAnalysis: SchoolAnalysis;
  students: StudentAnalysis[];
  /** 本地脱敏学生数据（基本信息表渲染用）。仅内存引用，绝不序列化到报告文件外 */
  studentsData: AnonymizedStudent[];
}
```

`src/report/generator.ts` 整个文件替换为：

```ts
import type { AnalysisResult } from '../analysis/provider';
import type { AnonymizedStudent } from '../types/student';
import type { Report } from './types';

/** 报告生成：仅在内存中组装（不上传、不落盘、不自动保存） */
export function generateReport(
  result: AnalysisResult,
  meta: { schoolName: string; cohort: string },
  now: Date,
  studentsData: AnonymizedStudent[],
): Report {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    title: '走访参考报告',
    schoolName: meta.schoolName,
    cohort: meta.cohort,
    generatedAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    schoolAnalysis: result.schoolAnalysis,
    students: result.students,
    studentsData,
  };
}
```

`src/report/markdown.ts` 整个文件替换为：

```ts
import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';

/**
 * 动态文本行转义：行首的「#」「*」「>」「-」标记与换行可能破坏 Markdown 结构
 * （仅影响本地 .md 显示，不改动报告数据本身）。
 */
export function escapeMdLine(text: string): string {
  return text
    .replace(/\r?\n/g, ' ') // 换行折叠为空格，避免打散段落/列表
    .replace(/^(?=[#*>-])/, '\\'); // 行首标题/列表/引用标记前加反斜杠转义
}

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示） */
function basicInfoLines(s: { [k: string]: unknown }): string[] {
  const lines: string[] = [];
  for (const [k, label] of Object.entries(STUDENT_FIELD_LABELS)) {
    if (k === 'anonymousId') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    lines.push(`- ${label}：${escapeMdLine(String(v))}`);
  }
  return lines;
}

/** 报告 → Markdown 文本（纯函数、确定性；不含日期随机量） */
export function reportToMarkdown(report: Report): string {
  const lines: string[] = [];
  const sa = report.schoolAnalysis;

  lines.push(`# ${report.title} — ${report.schoolName}（${report.cohort}）`);
  lines.push('');
  lines.push(`> 生成时间：${report.generatedAt}`);
  lines.push('> 说明：本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。');
  lines.push('');

  lines.push('## 一、学校整体情况');
  lines.push('');
  lines.push(escapeMdLine(sa.overview));
  lines.push('');
  lines.push('### 1. 困难类型分布');
  lines.push('');
  for (const p of sa.difficultyPatterns) lines.push(`- ${p}`);
  if (sa.difficultyPatterns.length === 0) lines.push('- 材料中未填写困难度，且未识别出明显困难类型。');
  lines.push('');
  lines.push('### 2. 共性问题');
  lines.push('');
  for (const i of sa.commonIssues) lines.push(`- ${escapeMdLine(i)}`);
  if (sa.commonIssues.length === 0) lines.push('- 暂无。');
  lines.push('');
  lines.push('### 3. 材料质量提示');
  lines.push('');
  for (const i of sa.dataQualityIssues) lines.push(`- ${escapeMdLine(i)}`);
  if (sa.dataQualityIssues.length === 0) lines.push('- 全部学生材料完整。');
  lines.push('');
  lines.push('### 4. 重点核实主题');
  lines.push('');
  for (const t of sa.keyVerificationTopics) lines.push(`- ${escapeMdLine(t)}`);
  if (sa.keyVerificationTopics.length === 0) lines.push('- 暂无。');
  lines.push('');
  lines.push('### 5. 整体面谈建议');
  lines.push('');
  for (const s of sa.interviewSuggestions) lines.push(`- ${escapeMdLine(s)}`);
  if (sa.interviewSuggestions.length === 0) lines.push('- 暂无。');
  lines.push('');

  lines.push('## 二、单个学生面谈参考');
  lines.push('');
  const dataById = new Map(report.studentsData.map((s) => [s.anonymousId, s]));
  for (const g of report.students) {
    lines.push(`### ${g.studentId}`);
    lines.push('');
    lines.push('#### 1. 基本情况');
    lines.push('');
    const local = dataById.get(g.studentId);
    if (local) {
      lines.push(...basicInfoLines(local));
    } else {
      lines.push('- 暂无。');
    }
    lines.push('');
    lines.push('#### 2. 材料要点摘要');
    lines.push('');
    lines.push(escapeMdLine(g.summary));
    lines.push('');
    lines.push('#### 3. 家庭情况概括');
    lines.push('');
    lines.push(escapeMdLine(g.familySituation));
    lines.push('');
    lines.push('#### 4. 主要困难因素');
    lines.push('');
    for (const f of g.mainDifficultyFactors) {
      lines.push(`- ${escapeMdLine(f.factor)}（${f.importance}）：${escapeMdLine(f.evidence)}`);
    }
    if (g.mainDifficultyFactors.length === 0) lines.push('- 材料中未识别出明显困难因素。');
    lines.push('');
    lines.push('#### 5. 需要重点核实');
    lines.push('');
    for (const v of g.informationToVerify) lines.push(`- ${escapeMdLine(v)}`);
    if (g.informationToVerify.length === 0) lines.push('- 暂未发现明显需要核实的事项。');
    lines.push('');
    lines.push('#### 6. 推荐面谈问题');
    lines.push('');
    g.interviewQuestions.forEach((q, i) => lines.push(`${i + 1}. ${escapeMdLine(q)}`));
    if (g.interviewQuestions.length === 0) lines.push('- 暂无。');
    lines.push('');
    lines.push('#### 7. 面谈注意事项');
    lines.push('');
    for (const c of g.interviewNotes) lines.push(`- ${escapeMdLine(c)}`);
    if (g.interviewNotes.length === 0) lines.push('- 无特殊注意事项。');
    lines.push('');
  }

  lines.push('## 三、通用面谈指南');
  lines.push('');
  for (const section of GENERAL_GUIDE) {
    lines.push(`### ${section.section}`);
    lines.push('');
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 8: 重写 tests/report.test.ts（新 Report 结构）**

整个文件替换为：

```ts
import { describe, it, expect } from 'vitest';
import { generateReport } from '../src/report/generator';
import { reportToMarkdown } from '../src/report/markdown';
import { MockAnalysisProvider } from '../src/analysis/mock-provider';
import type { AnonymizedStudent, AnalysisRequest } from '../src/types/student';
import type { Report } from '../src/report/types';

const sampleStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难，希望减轻负担', approvalComment: null,
  housingStatus: '租房（年租金/元）/10000以下', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const meta = { schoolName: '某中学', cohort: '2026级' };
const now = new Date('2026-08-21T10:00:00');

describe('generateReport + reportToMarkdown（新结构）', () => {
  it('生成报告模型（含本地学生数据引用）', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const report = generateReport(result, meta, now, [sampleStudent]);
    expect(report.schoolName).toBe('某中学');
    expect(report.students).toHaveLength(1);
    expect(report.studentsData).toHaveLength(1);
    expect(report.schoolAnalysis.studentCount).toBe(1);
  });

  it('Markdown 含两级结构与附录', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, meta, now, [sampleStudent]));
    expect(md).toContain('# 走访参考报告');
    expect(md).toContain('## 一、学校整体情况');
    expect(md).toContain('### student-001');
    expect(md).toContain('## 三、通用面谈指南');
    expect(md).toContain('2026-08-21');
    expect(md).toContain('本校共 1 名候选学生');
  });

  it('Markdown 学生部分含困难因素 importance 与本地基本信息', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, meta, now, [sampleStudent]));
    expect(md).toContain('- 重大疾病（high）');
    expect(md).toContain('- 性别：女');
    expect(md).toContain('#### 6. 推荐面谈问题');
  });

  it('Markdown 不含真实身份信息与结论性表述', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, meta, now, [sampleStudent]));
    expect(md).not.toMatch(/1[3-9]\d{9}/);
    expect(md).not.toMatch(/\d{17}[\dXx]/);
    expect(md).not.toContain('建议通过');
    expect(md).not.toContain('建议淘汰');
  });

  it('动态文本的 Markdown 转义（行首 #/*/>/与换行不破坏结构）', async () => {
    const adversarial: AnonymizedStudent = {
      ...sampleStudent,
      applicationReason: '# 请优先面谈\n> 需重点核实\n* 家长关注',
      housingStatus: '自建房\n（两层）',
    };
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [adversarial],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, meta, now, [adversarial]));
    expect(md).toContain('\\# 请优先面谈');
    expect(md).not.toMatch(/^# 请优先面谈/m);
    expect(md).toContain('\\# 请优先面谈 > 需重点核实 * 家长关注');
    expect(md).toContain('住房状况：自建房 （两层）');
  });

  it('空学生列表不崩溃且给出占位文案', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, meta, now, []));
    expect(md).toContain('本校共 0 名候选学生');
    expect(md).toContain('材料中未填写困难度，且未识别出明显困难类型');
  });

  it('各数组空态给出占位文案（未来 DeepSeek 空输出不悬挂标题）', () => {
    const report: Report = {
      title: '走访参考报告', schoolName: '某中学', cohort: '2026级',
      generatedAt: '2026-08-21 10:00',
      schoolAnalysis: {
        overview: '本校共 0 名候选学生。', studentCount: 0,
        difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
        keyVerificationTopics: [], interviewSuggestions: [],
      },
      students: [{
        studentId: 'student-001',
        summary: '材料中未填写申请理由。', familySituation: '材料中未填写家庭情况。',
        mainDifficultyFactors: [], informationToVerify: [],
        interviewQuestions: [], interviewNotes: [],
      }],
      studentsData: [],
    };
    const md = reportToMarkdown(report);
    expect(md).toContain('### 2. 共性问题\n\n- 暂无。');
    expect(md).toContain('### 3. 材料质量提示\n\n- 全部学生材料完整。');
    expect(md).toContain('#### 1. 基本情况\n\n- 暂无。');
    expect(md).toContain('#### 6. 推荐面谈问题\n\n- 暂无。');
  });
});
```

- [ ] **Step 9: 改造 src/components/ReportStep.tsx（新结构渲染 + 本地基本信息表）**

整个文件替换为：

```tsx
import { useMemo, useState } from 'react';
import type { Report } from '../report/types';
import type { StudentAnalysis } from '../analysis/provider';
import { reportToMarkdown } from '../report/markdown';
import { downloadTextFile } from '../utils/download';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';

const IMPORTANCE_TONE: Record<string, string> = { high: 'amber', medium: 'blue', low: 'slate' };

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示） */
function basicInfoOf(s: { [k: string]: unknown }): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, label] of Object.entries(STUDENT_FIELD_LABELS)) {
    if (k === 'anonymousId') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    out.push([label, String(v)]);
  }
  return out;
}

function StudentSection({ g, local, name }: {
  g: StudentAnalysis;
  local: { [k: string]: unknown } | undefined;
  name: string;
}) {
  const basics = local ? basicInfoOf(local) : [];
  return (
    <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
      {basics.length > 0 && (
        <section>
          <h4 className="font-medium text-slate-700">基本情况</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {basics.map(([label, value]) => <li key={label}>· {label}：{value}</li>)}
          </ul>
        </section>
      )}
      <section>
        <h4 className="font-medium text-slate-700">材料要点摘要</h4>
        <p className="mt-1 text-xs text-slate-600">{g.summary}</p>
      </section>
      <section>
        <h4 className="font-medium text-slate-700">家庭情况概括</h4>
        <p className="mt-1 text-xs text-slate-600">{g.familySituation}</p>
      </section>
      <section>
        <h4 className="font-medium text-slate-700">主要困难因素</h4>
        {g.mainDifficultyFactors.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {g.mainDifficultyFactors.map((f) => (
              <li key={f.factor} className="flex flex-wrap items-center gap-2">
                <Badge tone={IMPORTANCE_TONE[f.importance]}>{f.importance}</Badge>
                <span className="font-medium">{f.factor}</span>
                <span className="text-slate-500">{f.evidence}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-400">材料中未识别出明显困难因素。</p>
        )}
      </section>
      {g.informationToVerify.length > 0 && (
        <section>
          <h4 className="font-medium text-amber-700">需要重点核实</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {g.informationToVerify.map((v) => <li key={v}>· {v}</li>)}
          </ul>
        </section>
      )}
      <section>
        <h4 className="font-medium text-slate-700">推荐面谈问题</h4>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
          {g.interviewQuestions.map((q) => <li key={q}>{q}</li>)}
        </ol>
      </section>
      {g.interviewNotes.length > 0 && (
        <section>
          <h4 className="font-medium text-amber-700">面谈注意事项</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
            {g.interviewNotes.map((c) => <li key={c}>· {c}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function ReportStep({
  report, nameIndex, onReset,
}: {
  report: Report;
  nameIndex: Map<string, string>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // 本地姓名查找：仅内存匹配（匿名 ID ↔ 姓名），绝不发送
  const matches = useMemo(() => {
    const q = query.trim();
    if (q === '') return [];
    const hits: { id: string; name: string }[] = [];
    for (const [id, name] of nameIndex.entries()) {
      if (name.includes(q)) hits.push({ id, name });
    }
    return hits.slice(0, 10);
  }, [query, nameIndex]);

  const dataById = useMemo(
    () => new Map(report.studentsData.map((s) => [s.anonymousId, s] as const)),
    [report.studentsData],
  );

  const download = () => {
    const md = reportToMarkdown(report);
    const date = report.generatedAt.slice(0, 10);
    downloadTextFile(`走访参考报告-${report.schoolName}-${date}.md`, md, 'text/markdown;charset=utf-8');
  };

  const sa = report.schoolAnalysis;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              走访参考报告 — {report.schoolName}（{report.cohort}）
            </h2>
            <p className="mt-1 text-xs text-slate-500">生成时间：{report.generatedAt} · 仅存于当前页面内存</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={download}>下载走访参考报告（Markdown）</Button>
            <Button variant="secondary" onClick={onReset}>重新开始</Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。
          最终资格判断由工作人员根据申请材料、现场面谈与学校情况综合决定。
        </div>
        {/* 本地查找：输入姓名（仅本机内存匹配）定位到匿名编号 */}
        <div className="mt-4">
          <label className="text-sm text-slate-600">面谈时快速定位学生（本地查找，姓名仅在本机匹配）：</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入学生姓名的一部分…"
            className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {matches.length > 0 && (
            <ul className="mt-2 space-y-1">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(m.id)}
                    className="text-sm text-emerald-700 hover:underline"
                  >
                    {m.id}（{m.name}）
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">一、学校整体情况</h3>
        <p className="mt-2 text-sm text-slate-700">{sa.overview}</p>
        {sa.difficultyPatterns.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">困难类型分布</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sa.difficultyPatterns.map((p) => <Badge key={p} tone="slate">{p}</Badge>)}
            </div>
          </div>
        )}
        <section className="mt-3">
          <h4 className="text-sm font-medium text-slate-700">共性问题</h4>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
            {sa.commonIssues.map((i) => <li key={i}>· {i}</li>)}
            {sa.commonIssues.length === 0 && <li className="text-xs text-slate-400">暂无。</li>}
          </ul>
        </section>
        {sa.dataQualityIssues.length > 0 && (
          <section className="mt-3 rounded bg-amber-50 p-3">
            <h4 className="text-sm font-medium text-amber-800">材料质量提示</h4>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
              {sa.dataQualityIssues.map((i) => <li key={i}>· {i}</li>)}
            </ul>
          </section>
        )}
        <section className="mt-3">
          <h4 className="text-sm font-medium text-slate-700">重点核实主题</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sa.keyVerificationTopics.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
            {sa.keyVerificationTopics.length === 0 && <span className="text-xs text-slate-400">暂无。</span>}
          </div>
        </section>
        <section className="mt-3">
          <h4 className="text-sm font-medium text-slate-700">整体面谈建议</h4>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
            {sa.interviewSuggestions.map((s) => <li key={s}>· {s}</li>)}
            {sa.interviewSuggestions.length === 0 && <li className="text-xs text-slate-400">暂无。</li>}
          </ul>
        </section>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">二、单个学生面谈参考</h3>
        <div className="mt-3 space-y-2">
          {report.students.map((g) => (
            <div key={g.studentId} className="rounded border border-slate-200">
              <button
                type="button"
                onClick={() => setOpen(open === g.studentId ? null : g.studentId)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  {nameIndex.get(g.studentId) ?? g.studentId}
                  <span className="text-xs font-normal text-slate-400">{g.studentId}</span>
                  <Badge tone="green">{g.mainDifficultyFactors.filter((f) => f.importance === 'high').length} high</Badge>
                </span>
                <span className="text-xs text-slate-400">{open === g.studentId ? '收起' : '展开'}</span>
              </button>
              {open === g.studentId && (
                <StudentSection
                  g={g}
                  local={dataById.get(g.studentId)}
                  name={nameIndex.get(g.studentId) ?? g.studentId}
                />
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 10: 更新 App.tsx 的 generateReport 调用（新增第 4 参）**

`src/App.tsx` 第 90 行：

```ts
const report = generateReport(result, metaRef.current, new Date());
```

改为：

```ts
const report = generateReport(result, metaRef.current, new Date(), state.output.students);
```

- [ ] **Step 11: 运行相关测试**

```bash
npx vitest run tests/mock-provider.test.ts tests/report.test.ts tests/analysis-service.test.ts
```
Expected: 全部 PASS（mock-provider.test.ts 中 import payload 的用例在 Task 3 前会因模块缺失失败——将 Step 2 测试文件里对 `../src/analysis/payload` 的 import 临时改为内联 schema 校验前的准备：**执行修正**：Step 2 的测试文件里 import 语句在 Task 3 完成前会导致整个文件 import 失败。处理方式：本任务 Step 2 中，把「zod 契约校验」用例放在 Task 3 完成后的追加步骤（见 Task 3 Step 6），本任务先不 import payload。即：Step 2 的测试文件**删除**最后一条「学校级核实主题来自命中的因素」用例中的 payload import，改在文件顶部不引入 payload；「zod 契约校验」用例延后至 Task 3。

具体执行：Step 2 写测试文件时**去掉** `import { PROTOCOL_VERSION, wireResponseSchema } from '../src/analysis/payload';` 这一行（Task 3 会加回）。

- [ ] **Step 12: 全量验证**

```bash
npm run build
npm test
```
Expected: tsc 通过；全部测试绿。

- [ ] **Step 13: 提交**

```bash
git add src/analysis/provider.ts src/analysis/mock-provider.ts src/report/types.ts src/report/generator.ts src/report/markdown.ts src/components/ReportStep.tsx src/App.tsx tests/mock-provider.test.ts tests/report.test.ts tests/analysis-service.test.ts
git commit -m "refactor: 统一新分析结果结构（SchoolAnalysis/StudentAnalysis，Mock 与报告同步改造）

- Mock：weight→importance 映射、verificationPoints→informationToVerify、
  suggestedQuestions→interviewQuestions、cautions→interviewNotes、basicInfo 移除
- 报告：学校分析七段式渲染 + 学生列表展开 + 本地基本信息表（studentsData）
- 新结构契约由 tests 锁定（5-8 问题、无结论性表述、确定性）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: scanPayload 豁免参数（地址子句路径豁免）

**Files:**
- Modify: `src/security/scanner.ts`（第三可选参数）
- Test: `tests/scanner.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `tests/scanner.test.ts` 的 `describe('scanPayload', ...)` 内最后（第 164 行 `循环引用` 用例后）追加：

```ts
  it('出站 wire 结构：school.name 默认触发地址子句，豁免后通过（其余规则照常）', () => {
    const wire = {
      version: '1.0', requestId: 'x', school: { name: '大庆市杜尔伯特蒙古族自治县第一中学' },
      cohort: '2026级', students: [{ id: 'student-001', data: { housingStatus: '自建房' } }],
    };
    // 默认（无豁免）：school.name 含省市 → 地址子句命中
    expect(scanPayload(wire, new Set()).passed).toBe(false);
    // 豁免 school.name 地址子句：通过
    expect(scanPayload(wire, new Set(), { exemptAddressPaths: ['school.name'] }).passed).toBe(true);
    // 豁免只作用于地址子句：data 内手机号仍拒绝
    const withMobile = {
      ...wire,
      students: [{ id: 'student-001', data: { housingStatus: '电话13800138000' } }],
    };
    expect(scanPayload(withMobile, new Set(), { exemptAddressPaths: ['school.name'] }).passed).toBe(false);
  });

  it('豁免参数缺省时行为与旧版完全一致（第一阶段调用不受影响）', () => {
    expect(scanPayload(cleanRequest, new Set(['测试甲'])).passed).toBe(true);
  });
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/scanner.test.ts
```
Expected: FAIL——`scanPayload` 第三参数类型不存在（TS 报错），`exemptAddressPaths` 未生效。

- [ ] **Step 3: 修改 src/security/scanner.ts**

三处修改：

① `walk` 函数签名（第 30-36 行）加 `exemptAddressPaths` 参数并在地址子句检测处使用：

```ts
function walk(
  node: unknown,
  path: string,
  isStructuredRegion: boolean,
  isSchoolName: boolean,
  exemptAddressPaths: readonly string[],
  findings: SecurityFinding[],
): void {
```

② walk 内地址子句检测条件（第 55 行）由：

```ts
    if (!isSchoolName && !isStructuredRegion) {
```

改为：

```ts
    if (!isSchoolName && !isStructuredRegion && !exemptAddressPaths.includes(path)) {
```

③ 递归调用处（第 90、96-102 行）透传参数；`scanPayload` 签名（第 110 行）改为：

```ts
export interface ScanOptions {
  /** 豁免地址子句检测的字段路径（如出站 wire 结构的 'school.name'）。
   *  只豁免地址子句，其余规则（证件/电话/姓名模式/字段名）照常扫描。 */
  exemptAddressPaths?: readonly string[];
}

export function scanPayload(
  payload: unknown,
  nameBlacklist: Set<string>,
  options: ScanOptions = {},
): SecurityScanResult {
```

函数体内：`const exemptAddressPaths = options.exemptAddressPaths ?? [];`，随后 `walk(payload, '', false, false, exemptAddressPaths, findings);`（替换原 `walk(payload, '', false, false, findings)`），并同步更新 walk 内两处递归调用的实参。

- [ ] **Step 4: 运行验证通过**

```bash
npx vitest run tests/scanner.test.ts
```
Expected: PASS（新增 2 例 + 既有 17 例全绿）。

- [ ] **Step 5: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/security/scanner.ts tests/scanner.test.ts
git commit -m "feat: scanPayload 支持地址子句豁免路径（出站 wire 结构 school.name 用）

缺省时行为与旧版一致，第一阶段调用不受影响。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: payload.ts 协议层（wire 类型 + 出站构造 + 响应校验 + JSON 修复）

**Files:**
- Create: `src/analysis/payload.ts`
- Test: `tests/payload.test.ts`（新建）
- Modify: `tests/mock-provider.test.ts`（加回 zod 契约校验用例）

- [ ] **Step 1: 新建 tests/payload.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION, SENT_FIELDS, createAnalysisPayload, scanOutboundPayload,
  wireResponseSchema, parseResponseText,
} from '../src/analysis/payload';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const cleanStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const request: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [cleanStudent],
};

describe('SENT_FIELDS 白名单', () => {
  it('恰为 34 个字段且不含 anonymousId', () => {
    expect(SENT_FIELDS).toHaveLength(34);
    expect(SENT_FIELDS).not.toContain('anonymousId');
    expect(new Set(SENT_FIELDS).size).toBe(34); // 无重复
  });
});

describe('createAnalysisPayload', () => {
  it('结构/版本/requestId 正确', () => {
    const p = createAnalysisPayload(request, 'req-1');
    expect(p.version).toBe(PROTOCOL_VERSION);
    expect(p.requestId).toBe('req-1');
    expect(p.school).toEqual({ name: '某中学' });
    expect(p.cohort).toBe('2026级');
    expect(p.students).toHaveLength(1);
    expect(p.students[0].id).toBe('student-001');
  });

  it('data 只含 34 个白名单字段（额外属性不扩散）', () => {
    const extra = { ...cleanStudent, leakedField: '绝不出站' } as AnonymizedStudent & { leakedField: string };
    const p = createAnalysisPayload({ ...request, students: [extra] }, 'req-1');
    const dataKeys = Object.keys(p.students[0].data).sort();
    expect(dataKeys).toEqual([...SENT_FIELDS].sort());
    expect(JSON.stringify(p)).not.toContain('绝不出站');
  });

  it('null 字段原样保留（材料缺失信号给 AI，不臆测填值）', () => {
    const p = createAnalysisPayload(request, 'req-1');
    expect(p.students[0].data.annualIncomeNote).toBeNull();
  });

  it('序列化后不含任何敏感字段名与姓名', () => {
    const p = createAnalysisPayload(request, 'req-1');
    const json = JSON.stringify(p);
    expect(json).not.toContain('姓名');
    expect(json).not.toContain('身份证');
    expect(json).not.toContain('电话');
    expect(json).not.toContain('珍珠号');
  });
});

describe('scanOutboundPayload', () => {
  it('干净出站 payload 通过', () => {
    expect(scanOutboundPayload(createAnalysisPayload(request, 'req-1')).passed).toBe(true);
  });

  it('data 内残留假身份证 → 拒绝（出站终扫③）', () => {
    const bad = {
      ...cleanStudent,
      familySituation: '证件110101200001011234',
    };
    const r = scanOutboundPayload(createAnalysisPayload({ ...request, students: [bad] }, 'req-1'));
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('id-card');
  });

  it('data 内残留手机号 → 拒绝', () => {
    const bad = { ...cleanStudent, housingStatus: '电话13800138000' };
    const r = scanOutboundPayload(createAnalysisPayload({ ...request, students: [bad] }, 'req-1'));
    expect(r.passed).toBe(false);
  });
});

describe('wireResponseSchema', () => {
  const schoolAnalysis = {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: ['低收入：1人'], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  };
  const okStudent = {
    studentId: 'student-001', summary: 's', familySituation: 'f',
    mainDifficultyFactors: [{ factor: '低收入', evidence: '人均年收入8000元', importance: 'high' }],
    informationToVerify: [], interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
  };

  it('合法响应通过', () => {
    const r = wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis, students: [okStudent],
    });
    expect(r.success).toBe(true);
  });

  it('版本不匹配 → 拒绝', () => {
    expect(wireResponseSchema.safeParse({ version: '2.0', schoolAnalysis, students: [] }).success).toBe(false);
  });

  it('interviewQuestions 少于 5 → 拒绝；恰好 8 → 通过', () => {
    expect(wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis,
      students: [{ ...okStudent, interviewQuestions: ['q1', 'q2'] }],
    }).success).toBe(false);
    expect(wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis,
      students: [{ ...okStudent, interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] }],
    }).success).toBe(true);
  });

  it('importance 非法枚举 → 拒绝', () => {
    expect(wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis,
      students: [{ ...okStudent, mainDifficultyFactors: [{ factor: 'x', evidence: 'e', importance: 'critical' }] }],
    }).success).toBe(false);
  });

  it('未知多余键忽略（非严格模式）', () => {
    const r = wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis, students: [okStudent], extraKey: 'whatever',
    });
    expect(r.success).toBe(true);
  });
});

describe('parseResponseText（JSON 修复一次）', () => {
  it('直接解析合法 JSON', () => {
    expect(parseResponseText('{"a":1}')).toEqual({ a: 1 });
  });

  it('markdown 围栏剥离后解析', () => {
    expect(parseResponseText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('前后缀文本中提取首个 {...} 块', () => {
    expect(parseResponseText('分析完成。结果是 {"a":1} 请查收。')).toEqual({ a: 1 });
  });

  it('嵌套花括号（字符串内）不提前截断', () => {
    expect(parseResponseText('{"a":"{b}"}')).toEqual({ a: '{b}' });
  });

  it('无法修复 → null（不抛异常、不静默吞错）', () => {
    expect(parseResponseText('这不是 JSON')).toBeNull();
    expect(parseResponseText('')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/payload.test.ts
```
Expected: FAIL——`../src/analysis/payload` 模块不存在。

- [ ] **Step 3: 新建 src/analysis/payload.ts**

```ts
import { z } from 'zod';
import type { AnalysisRequest, AnonymizedStudent } from '../types/student';
import { scanPayload, type SecurityScanResult } from '../security/scanner';

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
  school: { name: string };
  cohort: string;
  students: { id: string; data: WireStudentData }[];
}

/**
 * 唯一出站构造点：AnalysisRequest → wire 请求。
 * 只拷贝 SENT_FIELDS 白名单字段；调用方必须先经过 AnalysisService 硬闸。
 */
export function createAnalysisPayload(request: AnalysisRequest, requestId: string): WireAnalysisRequest {
  return {
    version: PROTOCOL_VERSION,
    requestId,
    school: { name: request.meta.schoolName },
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
 */
export function scanOutboundPayload(payload: WireAnalysisRequest): SecurityScanResult {
  return scanPayload(payload, new Set(), { exemptAddressPaths: ['school.name'] });
}

// ── 响应契约（zod）──────────────────────────────────────────────

export const importanceSchema = z.enum(['high', 'medium', 'low']);

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
```

- [ ] **Step 4: 运行验证通过**

```bash
npx vitest run tests/payload.test.ts
```
Expected: PASS（全部用例）。

- [ ] **Step 5: 补回 mock-provider.test.ts 的 zod 契约校验用例**

在 `tests/mock-provider.test.ts` 顶部加：

```ts
import { PROTOCOL_VERSION, wireResponseSchema } from '../src/analysis/payload';
```

并在 describe 内最后追加：

```ts
  it('Mock 输出通过 wire 响应契约校验（与真实 provider 同构）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const r = wireResponseSchema.safeParse({ version: PROTOCOL_VERSION, ...result });
    expect(r.success).toBe(true);
  });
```

- [ ] **Step 6: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/analysis/payload.ts tests/payload.test.ts tests/mock-provider.test.ts
git commit -m "feat: payload 协议层（wire 类型/zod 契约/出站唯一构造点/JSON 修复一次）

- SENT_FIELDS 34 字段显式白名单 + 编译期不变量（数量与覆盖双向锁定）
- createAnalysisPayload：唯一出站构造点，额外属性不扩散
- scanOutboundPayload：出站终扫（school.name 豁免地址子句）
- wireResponseSchema：version 1.0/importance 枚举/问题 5-8/非严格模式
- parseResponseText：直接解析失败则剥围栏+提取首个{...}修复一次

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 隐私守卫白名单改造（fetch 白名单 + console 拆分 + 原始类型引用白名单）

**Files:**
- Modify: `tests/no-persistence.test.ts`

- [ ] **Step 1: 重写 tests/no-persistence.test.ts**

整个文件替换为：

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 隐私红线静态守卫（绊线）。
 * 本守卫只做子串匹配，可被刻意绕过；其定位是防「意外引入」，
 * 恶意代码由运行时硬闸（AnalysisService 发送前安全扫描）兜底。
 * 第二阶段改造：fetch( 从全局禁止改为单文件白名单（analysis-client.ts 是唯一网络出口）；
 * console 拆分为「数据日志禁止（log/info/debug/trace）/ 警告允许（warn/error，仅 src/analysis/ 目录，
 * 且约定参数仅常量文案——语义由代码评审把关）」。
 */

/** 收集 src/ 下所有 .ts/.tsx 源码 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const srcDir = fileURLToPath(new URL('../src', import.meta.url));
const files = collectSourceFiles(srcDir);
const relOf = (f: string) => relative(srcDir, f).split('\\').join('/');

/** 全局禁止：持久化/第三方网络库/Node 全局/数据日志 */
const FORBIDDEN_TOKENS = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
  'axios', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'process.',
  'console.log', 'console.info', 'console.debug', 'console.trace',
];

/** fetch( 唯一白名单文件（相对 src/） */
const FETCH_WHITELIST = new Set(['analysis/analysis-client.ts']);

/** console.warn/error 允许目录（相对 src/） */
const CONSOLE_WARN_DIR = 'analysis/';

/** RawStudentRecord 引用白名单（原始行类型不得扩散到其他模块） */
const RAW_TYPE_WHITELIST = new Set([
  'types/student.ts',          // 定义处
  'anonymization/raw-store.ts', // 受控仓库
  'anonymization/anonymizer.ts', // 脱敏流水线
  'App.tsx',                    // 解析后唯一构造点
]);

describe('隐私红线静态守卫', () => {
  it('src 源码中不出现持久化/第三方网络库/Node 全局/数据日志 API', () => {
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (content.includes(token)) hits.push(`${relOf(f)}: ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('fetch( 只允许出现在网络白名单文件（唯一网络出口）', () => {
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (content.includes('fetch(') && !FETCH_WHITELIST.has(relOf(f))) {
        hits.push(relOf(f));
      }
    }
    expect(hits).toEqual([]);
  });

  it('console.warn/error 只允许出现在 src/analysis/ 目录（且约定仅常量文案）', () => {
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if ((content.includes('console.warn') || content.includes('console.error')) && !relOf(f).startsWith(CONSOLE_WARN_DIR)) {
        hits.push(relOf(f));
      }
    }
    expect(hits).toEqual([]);
  });

  it('RawStudentRecord 类型引用只允许出现在白名单文件（原始行不扩散）', () => {
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (content.includes('RawStudentRecord') && !RAW_TYPE_WHITELIST.has(relOf(f))) {
        hits.push(relOf(f));
      }
    }
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行守卫测试（当前代码应全绿）**

```bash
npx vitest run tests/no-persistence.test.ts
```
Expected: PASS（当前 src/ 无 fetch(、无 console 调用、RawStudentRecord 恰在白名单 4 文件）。

- [ ] **Step 3: 全量验证 + 提交**

```bash
npm test
git add tests/no-persistence.test.ts
git commit -m "test: 隐私守卫白名单改造（fetch 单文件白名单/console 拆分/原始类型引用白名单）

为第二阶段网络层（analysis-client.ts）预留唯一 fetch 出口。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: analysis-client.ts 网络层（唯一 fetch 出口）

**Files:**
- Create: `src/analysis/analysis-client.ts`
- Test: `tests/analysis-client.test.ts`（新建）

- [ ] **Step 1: 新建 tests/analysis-client.test.ts**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AnalysisClient, AnalysisClientError, CATEGORY_MESSAGES, DEFAULT_TIMEOUT_MS,
} from '../src/analysis/analysis-client';
import { createAnalysisPayload } from '../src/analysis/payload';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const cleanStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const request: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [cleanStudent],
};

const payload = createAnalysisPayload(request, 'req-1');

const wireResponse = {
  version: '1.0',
  schoolAnalysis: {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [{
    studentId: 'student-001', summary: 's', familySituation: 'f',
    mainDifficultyFactors: [], informationToVerify: [],
    interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
  }],
};

function okResponse(body: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: true, status: 200, text: async () => JSON.stringify(body), ...init,
  } as Response;
}

function errorResponse(status: number, body = 'server error details'): Response {
  return {
    ok: false, status, text: async () => body, ...{},
  } as Response;
}

const client = new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: DEFAULT_TIMEOUT_MS });

describe('AnalysisClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('2xx 合法响应 → 解析成功；方法/头/body 正确', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(wireResponse));
    vi.stubGlobal('fetch', fetchMock);
    const result = await client.analyze(payload);
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.org/api/analyze');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body).requestId).toBe('req-1');
  });

  it('401/403/400/404 → configuration 类别，文案不含服务端错误原文', async () => {
    for (const status of [400, 401, 403, 404]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(status, 'secret detail')));
      const err = await client.analyze(payload).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AnalysisClientError);
      expect((err as AnalysisClientError).category).toBe('configuration');
      expect(err.message).not.toContain('secret detail');
      expect(err.message).toBe(CATEGORY_MESSAGES.configuration);
    }
  });

  it('429 → rate-limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(429)));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('rate-limited');
  });

  it('500 → server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500)));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('server');
  });

  it('fetch reject（网络失败）→ network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('network');
  });

  it('AbortError → timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('timeout');
  });

  it('响应体非法 JSON → 修复后成功（markdown 围栏）', async () => {
    const body = '好的，以下是分析结果：\n```json\n' + JSON.stringify(wireResponse) + '\n```';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(null, { text: async () => body })));
    const result = await client.analyze(payload);
    expect(result.students[0].studentId).toBe('student-001');
  });

  it('响应体修复失败 → format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(null, { text: async () => '完全不是 JSON' })));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('format');
  });

  it('zod 校验失败（问题数不足）→ format', async () => {
    const bad = {
      ...wireResponse,
      students: [{ ...wireResponse.students[0], interviewQuestions: ['q1'] }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(bad)));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('format');
  });

  it('超时阈值触发 AbortController（fake timers）', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const shortClient = new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: 1000 });
      const p = shortClient.analyze(payload).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      const err = await p;
      expect((err as AnalysisClientError).category).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('响应体 text() 读取失败 → network（不泄漏原始异常）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(null, {
      text: async () => { throw new Error('body stream broken'); },
    })));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('network');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/analysis-client.test.ts
```
Expected: FAIL——`../src/analysis/analysis-client` 模块不存在。

- [ ] **Step 3: 新建 src/analysis/analysis-client.ts**

```ts
import {
  parseResponseText, wireResponseSchema,
  type WireAnalysisRequest, type WireAnalysisResponse,
} from './payload';

export type AnalysisErrorCategory =
  | 'network' | 'timeout' | 'configuration' | 'rate-limited' | 'server' | 'format';

/** 用户可见文案（绝不展示服务端错误原文）。SecurityViolationError 文案由 analysis-service 提供。 */
export const CATEGORY_MESSAGES: Record<AnalysisErrorCategory, string> = {
  network: '网络连接失败，请检查网络后重试。',
  timeout: '分析请求超时，请稍后重试。',
  configuration: '分析服务配置有误，请联系系统管理员。',
  'rate-limited': '请求过于频繁，请稍候片刻再试。',
  server: '分析服务暂时不可用，请稍后重试。',
  format: '分析结果格式异常，请重试；若反复出现请联系系统管理员。',
};

export class AnalysisClientError extends Error {
  constructor(readonly category: AnalysisErrorCategory) {
    super(CATEGORY_MESSAGES[category]);
    this.name = 'AnalysisClientError';
  }
}

export interface AnalysisClientConfig {
  apiUrl: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 纯网络层：唯一 fetch 出口（no-persistence 守卫白名单锁定本文件）。
 * 只接受 WireAnalysisRequest（原始对象类型在此编译期不兼容）。
 * 职责：POST → 状态码分类 → JSON 修复一次 → zod 校验。绝不输出任何日志、绝不读取调用方其他数据。
 */
export class AnalysisClient {
  constructor(private readonly config: AnalysisClientConfig) {}

  async analyze(payload: WireAnalysisRequest): Promise<WireAnalysisResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new AnalysisClientError('timeout');
      throw new AnalysisClientError('network');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 429) throw new AnalysisClientError('rate-limited');
      if (response.status >= 500) throw new AnalysisClientError('server');
      throw new AnalysisClientError('configuration');
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AnalysisClientError('network');
    }

    const raw = parseResponseText(text);
    if (raw === null) throw new AnalysisClientError('format');
    const parsed = wireResponseSchema.safeParse(raw);
    if (!parsed.success) throw new AnalysisClientError('format');
    return parsed.data;
  }
}
```

- [ ] **Step 4: 运行验证通过（含守卫）**

```bash
npx vitest run tests/analysis-client.test.ts tests/no-persistence.test.ts
```
Expected: 全部 PASS（守卫确认 fetch 只在本白名单文件）。

- [ ] **Step 5: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/analysis/analysis-client.ts tests/analysis-client.test.ts
git commit -m "feat: analysis-client 纯网络层（唯一 fetch 出口，错误七分类，JSON 修复一次）

- 30s AbortController 超时；状态码分类：400/401/403/404→configuration、
  429→rate-limited、5xx→server；2xx→修复+解析+zod 校验
- AnalysisClientError.message 即用户可见分类文案（绝不含服务端错误原文）
- 守卫白名单（Task 4）自动生效

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: deepseek-provider.ts（重扫② + 出站终扫③ + 学生集合一致性）

**Files:**
- Create: `src/analysis/deepseek-provider.ts`
- Test: `tests/deepseek-provider.test.ts`（新建）
- Modify: `src/analysis/analysis-service.ts`（SecurityViolationError 文案对齐错误文案表）

- [ ] **Step 1: 新建 tests/deepseek-provider.test.ts**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekAnalysisProvider } from '../src/analysis/deepseek-provider';
import { AnalysisClient } from '../src/analysis/analysis-client';
import { SecurityViolationError } from '../src/analysis/analysis-service';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const cleanStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const request: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [cleanStudent],
};

const wireResponse = (ids: string[]) => ({
  version: '1.0',
  schoolAnalysis: {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: ids.map((id) => ({
    studentId: id, summary: 's', familySituation: 'f',
    mainDifficultyFactors: [], informationToVerify: [],
    interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
  })),
});

function makeProvider(): { provider: DeepSeekAnalysisProvider; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200, text: async () => JSON.stringify(wireResponse(['student-001'])),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  const client = new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: 30_000 });
  return { provider: new DeepSeekAnalysisProvider(client), fetchMock };
}

describe('DeepSeekAnalysisProvider', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('重扫②命中（伪造手机号混入）→ SecurityViolationError 且 fetch 零调用', async () => {
    const { provider, fetchMock } = makeProvider();
    const bad: AnalysisRequest = {
      ...request,
      students: [{ ...cleanStudent, housingStatus: '电话13800138000' }],
    };
    await expect(provider.analyze(bad)).rejects.toBeInstanceOf(SecurityViolationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('重扫②命中（伪造身份证混入叙事）→ 拦截', async () => {
    const { provider, fetchMock } = makeProvider();
    const bad: AnalysisRequest = {
      ...request,
      students: [{ ...cleanStudent, familySituation: '证件110101200001011234' }],
    };
    await expect(provider.analyze(bad)).rejects.toBeInstanceOf(SecurityViolationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('通过后 fetch 恰一次，body 为脱敏 payload（requestId 为 UUID）', async () => {
    const { provider, fetchMock } = makeProvider();
    const result = await provider.analyze(request);
    expect(result.students[0].studentId).toBe('student-001');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.org/api/analyze');
    const body = JSON.parse(init.body);
    expect(body.version).toBe('1.0');
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.school).toEqual({ name: '某中学' });
    expect(body.students[0].id).toBe('student-001');
    expect(JSON.stringify(body)).not.toContain('姓名');
    expect(JSON.stringify(body)).not.toContain('13800138000');
  });

  it('响应学生集合与请求不一致（缺失学生）→ format 错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify(wireResponse([])),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: 30_000 }),
    );
    const err = await provider.analyze(request).catch((e: unknown) => e);
    expect((err as Error).message).toContain('格式异常');
  });

  it('响应含请求中不存在的 studentId → format 错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify(wireResponse(['student-999'])),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: 30_000 }),
    );
    const err = await provider.analyze(request).catch((e: unknown) => e);
    expect((err as Error).message).toContain('格式异常');
  });

  it('响应顺序与请求不同（集合一致）→ 通过', async () => {
    const two: AnalysisRequest = {
      ...request,
      students: [cleanStudent, { ...cleanStudent, anonymousId: 'student-002' }],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify(wireResponse(['student-002', 'student-001'])),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: 30_000 }),
    );
    const result = await provider.analyze(two);
    expect(result.students).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/deepseek-provider.test.ts
```
Expected: FAIL——`../src/analysis/deepseek-provider` 模块不存在。

- [ ] **Step 3: 新建 src/analysis/deepseek-provider.ts**

```ts
import { scanPayload } from '../security/scanner';
import { SecurityViolationError } from './analysis-service';
import { AnalysisClient, AnalysisClientError } from './analysis-client';
import {
  createAnalysisPayload, scanOutboundPayload,
  type WireAnalysisResponse,
} from './payload';
import type { AnalysisProvider, AnalysisResult } from './provider';
import type { AnalysisRequest } from '../types/student';

/** 响应学生集合必须与请求一一对应（顺序不限），否则按格式错误处理（绝不静默丢学生） */
function assertStudentMatch(request: AnalysisRequest, wire: WireAnalysisResponse): void {
  const requestIds = new Set(request.students.map((s) => s.anonymousId));
  const responseIds = wire.students.map((s) => s.studentId);
  if (
    responseIds.length !== request.students.length
    || responseIds.some((id) => !requestIds.has(id))
  ) {
    throw new AnalysisClientError('format');
  }
}

/**
 * DeepSeek 分析提供者（经分析服务器中转，前端绝不接触 API Key）。
 * 安全链：重扫②（不信任调用方）→ createAnalysisPayload（唯一出站构造点）→ 出站终扫③ → fetch。
 * 任何一步失败即抛 SecurityViolationError / AnalysisClientError，绝不发送。
 * 本类与 AnalysisClient 不公共导出：仅 provider-factory 内部构造。
 */
export class DeepSeekAnalysisProvider implements AnalysisProvider {
  readonly name = 'deepseek';

  constructor(private readonly client: AnalysisClient) {}

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    // 重扫②：规则级扫描（姓名黑名单上下文检查由 AnalysisService 硬闸①负责）
    const rescan = scanPayload(request, new Set());
    if (!rescan.passed) {
      throw new SecurityViolationError(rescan.findings);
    }

    const payload = createAnalysisPayload(request, crypto.randomUUID());

    // 出站终扫③：对最终 wire 结构做规则 + 禁止字段名 + 结构守卫
    const outbound = scanOutboundPayload(payload);
    if (!outbound.passed) {
      throw new SecurityViolationError(outbound.findings);
    }

    const wire = await this.client.analyze(payload);
    assertStudentMatch(request, wire);
    // wire 响应经 zod 校验后形状与领域结构一致（契约同构），直接作为分析结果
    return wire;
  }
}
```

- [ ] **Step 4: SecurityViolationError 文案对齐错误文案表**

`src/analysis/analysis-service.ts` 第 6-10 行 `SecurityViolationError` 构造函数中：

```ts
    super('发送前安全检查未通过');
```

改为：

```ts
    super('数据未通过发送前安全检查，已阻止发送，请返回检查数据。');
```

（`analysis-service.test.ts` 只断言 instanceOf 与 findings，不受影响。）

- [ ] **Step 5: 运行验证通过**

```bash
npx vitest run tests/deepseek-provider.test.ts tests/analysis-service.test.ts
```
Expected: PASS。

- [ ] **Step 6: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/analysis/deepseek-provider.ts src/analysis/analysis-service.ts tests/deepseek-provider.test.ts
git commit -m "feat: DeepSeekAnalysisProvider（重扫→出站构造→终扫→fetch，集合一致性校验）

- 不信任调用方：provider 内部再次执行 scanPayload（规则级重扫）
- createAnalysisPayload 后再次 scanOutboundPayload（fetch 前最后防线）
- 响应学生集合必须与请求一一对应，否则按格式错误拒绝
- SecurityViolationError 文案对齐错误分类文案表

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: provider-factory + 环境变量（切换与回退）

**Files:**
- Create: `src/analysis/provider-factory.ts`、`src/vite-env.d.ts`、`.env.example`
- Test: `tests/provider-factory.test.ts`（新建）
- Modify: `.gitignore`（`!.env.example` 例外）

- [ ] **Step 1: 新建 tests/provider-factory.test.ts**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnalysisService } from '../src/analysis/provider-factory';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const cleanStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const request: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [cleanStudent],
};

describe('createAnalysisService', () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('默认（未设置 provider）→ Mock：本地分析成功且零网络', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(result.students[0].interviewQuestions.length).toBeGreaterThanOrEqual(5);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('VITE_ANALYSIS_PROVIDER=real 但未配 API 地址 → 回退 Mock + console.warn 常量提示', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('回退');
  });

  it('VITE_ANALYSIS_PROVIDER=real + 配置地址 → 走真实网络（fetch 调用一次）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    vi.stubEnv('VITE_ANALYSIS_API_URL', 'https://example.org/api/analyze');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        version: '1.0',
        schoolAnalysis: {
          overview: '本校共 1 名候选学生。', studentCount: 1,
          difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
          keyVerificationTopics: [], interviewSuggestions: [],
        },
        students: [{
          studentId: 'student-001', summary: 's', familySituation: 'f',
          mainDifficultyFactors: [], informationToVerify: [],
          interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
        }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('未知 provider 值 → 按 mock 处理（fail-safe 默认）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'other');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    await service.analyze(request, new Set());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('VITE_ANALYSIS_TIMEOUT_MS 非法值 → 默认 30s；合法值 → 生效（config 覆盖）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    vi.stubEnv('VITE_ANALYSIS_API_URL', 'https://example.org/api/analyze');
    vi.stubEnv('VITE_ANALYSIS_TIMEOUT_MS', 'abc');
    // 非法 env 值：构造不抛异常（按默认处理），仅验证 service 可用
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        version: '1.0',
        schoolAnalysis: {
          overview: 'x', studentCount: 1, difficultyPatterns: [], commonIssues: [],
          dataQualityIssues: [], keyVerificationTopics: [], interviewSuggestions: [],
        },
        students: [{
          studentId: 'student-001', summary: 's', familySituation: 'f',
          mainDifficultyFactors: [], informationToVerify: [],
          interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
        }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    expect(() => createAnalysisService()).not.toThrow();
    // config.timeoutMs 覆盖 env（200ms 内完成）
    const service = createAnalysisService({ timeoutMs: 30_000 });
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
  });

  it('真实 provider 下服务硬闸①仍生效（伪造敏感数据被拦截、fetch 零调用）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    vi.stubEnv('VITE_ANALYSIS_API_URL', 'https://example.org/api/analyze');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const bad: AnalysisRequest = {
      ...request,
      students: [{ ...cleanStudent, familySituation: '证件110101200001011234' }],
    };
    await expect(service.analyze(bad, new Set())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/provider-factory.test.ts
```
Expected: FAIL——`../src/analysis/provider-factory` 模块不存在。

- [ ] **Step 3: 新建 src/analysis/provider-factory.ts**

```ts
import { AnalysisService } from './analysis-service';
import { MockAnalysisProvider } from './mock-provider';
import { AnalysisClient, DEFAULT_TIMEOUT_MS } from './analysis-client';
import { DeepSeekAnalysisProvider } from './deepseek-provider';

export interface AnalysisServiceConfig {
  /** 覆盖 VITE_ANALYSIS_API_URL（测试/特殊部署用） */
  apiUrl?: string;
  /** 覆盖 VITE_ANALYSIS_TIMEOUT_MS（默认 30000） */
  timeoutMs?: number;
}

function resolveTimeout(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * 分析服务工厂：UI 唯一入口。
 * provider 种类由环境变量 VITE_ANALYSIS_PROVIDER 决定：'real' | 'mock'（默认，含未设置与未知值）。
 * real 但未配置 VITE_ANALYSIS_API_URL → 回退 Mock + console.warn 常量提示（绝不静默假装真实 AI）。
 * 网络类（DeepSeekAnalysisProvider / AnalysisClient）不从此模块导出。
 * 绝不引入任何 API Key 相关环境变量（Key 只存在于分析服务器端）。
 */
export function createAnalysisService(config: AnalysisServiceConfig = {}): AnalysisService {
  const provider = import.meta.env.VITE_ANALYSIS_PROVIDER;
  if (provider === 'real') {
    const apiUrl = config.apiUrl ?? import.meta.env.VITE_ANALYSIS_API_URL;
    if (!apiUrl) {
      console.warn('已配置真实 AI 分析但未提供 API 地址，本次会话回退到本地模拟分析。');
      return new AnalysisService(new MockAnalysisProvider());
    }
    const timeoutMs = config.timeoutMs ?? resolveTimeout(import.meta.env.VITE_ANALYSIS_TIMEOUT_MS);
    return new AnalysisService(
      new DeepSeekAnalysisProvider(new AnalysisClient({ apiUrl, timeoutMs })),
    );
  }
  return new AnalysisService(new MockAnalysisProvider());
}
```

- [ ] **Step 4: 新建 src/vite-env.d.ts（环境变量类型声明）**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 分析提供者：'mock'（默认，含未设置/未知值）| 'real' */
  readonly VITE_ANALYSIS_PROVIDER?: string;
  /** 分析服务器完整端点（real 时必填）。绝不放置任何 API Key */
  readonly VITE_ANALYSIS_API_URL?: string;
  /** 请求超时毫秒数，默认 30000 */
  readonly VITE_ANALYSIS_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: 新建 .env.example 并加 gitignore 例外**

`.env.example`（项目根目录）：

```
# 分析提供者：mock（默认，含未设置/未知值）| real
VITE_ANALYSIS_PROVIDER=mock

# 分析服务器完整端点（VITE_ANALYSIS_PROVIDER=real 时必填）
# 安全红线：API Key 只配置在分析服务器端，绝不写在此处或任何前端环境变量
VITE_ANALYSIS_API_URL=

# 请求超时毫秒数（默认 30000）
VITE_ANALYSIS_TIMEOUT_MS=30000
```

`.gitignore` 在 `.env.*` 行后追加一行：

```
!.env.example
```

- [ ] **Step 6: 运行验证通过**

```bash
npx vitest run tests/provider-factory.test.ts tests/no-persistence.test.ts
```
Expected: PASS（守卫确认 console.warn 只出现在 src/analysis/ 目录）。

- [ ] **Step 7: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/analysis/provider-factory.ts src/vite-env.d.ts .env.example .gitignore tests/provider-factory.test.ts
git commit -m "feat: provider-factory 与环境变量切换（mock 默认/real 回退，绝不引入 API Key）

- createAnalysisService：UI 唯一入口，网络类不公共导出
- VITE_ANALYSIS_PROVIDER/VITE_ANALYSIS_API_URL/VITE_ANALYSIS_TIMEOUT_MS 三变量
- real 未配 URL → 回退 Mock + console.warn 常量提示

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 统计事件扩展（analysisStarted/Succeeded/Failed，内存态）

**Files:**
- Modify: `src/stats/usage-stats.ts`
- Test: `tests/usage-stats.test.ts`（重写）

- [ ] **Step 1: 重写 tests/usage-stats.test.ts**

整个文件替换为：

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryUsageStats } from '../src/stats/usage-stats';

describe('InMemoryUsageStats', () => {
  it('计数事件与学生人数总和（分析完成 = 成功 + 失败）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 32 });
    stats.record('imported', { studentCount: 45 });
    stats.record('analysisStarted');
    stats.record('analysisSucceeded');
    stats.record('analysisFailed', { errorCategory: 'timeout' });
    expect(stats.getSnapshot()).toEqual({
      imports: 2, analyses: 1, analysisFailures: 1, totalStudents: 77,
    });
  });

  it('analysisStarted 不计入任何计数（启动次数 = 成功 + 失败推导）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('analysisStarted');
    expect(stats.getSnapshot()).toEqual({
      imports: 0, analyses: 0, analysisFailures: 0, totalStudents: 0,
    });
  });

  it('快照只含白名单计数（绝不包含学生数据/错误详情）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 1 });
    stats.record('analysisFailed', { errorCategory: 'format' });
    const snap = stats.getSnapshot();
    expect(Object.keys(snap).sort()).toEqual(['analyses', 'analysisFailures', 'imports', 'totalStudents']);
    expect(JSON.stringify(snap)).not.toContain('学生');
  });

  it('errorCategory 只接受白名单键（类型级：多余键被忽略，失败类别字符串不参与快照）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('analysisFailed', { errorCategory: 'timeout', studentCount: 99 } as never);
    // 失败事件绝不计入学生人数（导入已计过）
    expect(stats.getSnapshot().totalStudents).toBe(0);
  });

  it('imported 缺 meta 时人数按 0 计', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported');
    expect(stats.getSnapshot()).toEqual({
      imports: 1, analyses: 0, analysisFailures: 0, totalStudents: 0,
    });
  });

  it('快照为副本：修改快照不影响后续快照', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 5 });
    const snap = stats.getSnapshot();
    snap.imports = 999;
    snap.totalStudents = 0;
    expect(stats.getSnapshot()).toEqual({
      imports: 1, analyses: 0, analysisFailures: 0, totalStudents: 5,
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/usage-stats.test.ts
```
Expected: FAIL——`analysisStarted` 等事件不在 `UsageEvent` 联合类型中（TS 报错）。

- [ ] **Step 3: 改写 src/stats/usage-stats.ts**

整个文件替换为：

```ts
/** 统计白名单事件：只允许计数，绝不包含任何学生数据 */
export type UsageEvent = 'imported' | 'analysisStarted' | 'analysisSucceeded' | 'analysisFailed';

/** 事件元数据白名单：studentCount 仅 imported；errorCategory 仅 analysisFailed（类别枚举名，非错误原文） */
export interface UsageEventMeta {
  studentCount?: number;
  errorCategory?: string;
}

export interface UsageSnapshot {
  imports: number;
  analyses: number; // 成功次数（启动次数 = analyses + analysisFailures 推导）
  analysisFailures: number;
  totalStudents: number; // 学生人数总和（平均人数由此推导）
}

export interface UsageStats {
  record(event: UsageEvent, meta?: UsageEventMeta): void;
  getSnapshot(): UsageSnapshot;
}

/**
 * 内存实现：不持久化、不上报。
 * 未来如需上报，只能上报 UsageSnapshot 中的白名单计数。
 */
export class InMemoryUsageStats implements UsageStats {
  private imports = 0;
  private analyses = 0;
  private analysisFailures = 0;
  private totalStudents = 0;

  record(event: UsageEvent, meta?: UsageEventMeta): void {
    switch (event) {
      case 'imported':
        this.imports += 1;
        this.totalStudents += meta?.studentCount ?? 0;
        break;
      case 'analysisSucceeded':
        this.analyses += 1;
        break;
      case 'analysisFailed':
        this.analysisFailures += 1;
        break;
      case 'analysisStarted':
        // 有意不计数：启动次数由 analyses + analysisFailures 推导，避免双计
        break;
      default: {
        // 白名单外事件故意静默忽略（fail-safe 语义，运行时绝不抛异常）；
        // never 标注保证编译期穷尽当前 UsageEvent 联合类型（新增事件时在此显式处理）。
        const _unhandled: never = event;
        void _unhandled;
      }
    }
  }

  getSnapshot(): UsageSnapshot {
    return {
      imports: this.imports,
      analyses: this.analyses,
      analysisFailures: this.analysisFailures,
      totalStudents: this.totalStudents,
    };
  }
}
```

- [ ] **Step 4: 运行验证通过**

```bash
npx vitest run tests/usage-stats.test.ts
```
Expected: PASS。

- [ ] **Step 5: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/stats/usage-stats.ts tests/usage-stats.test.ts
git commit -m "feat: 统计事件扩展（analysisStarted/Succeeded/Failed 三件套，内存态）

- analysisCompleted 由 succeeded/failed 取代；启动次数 = 两者之和推导
- analysisFailed meta 仅允许 errorCategory（类别枚举名，绝不含错误原文）
- 不持久化、不上报红线不变

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: UI 接线（SendPreviewStep + SecurityStep onNext + App 工厂/确认子态/统计事件）

**Files:**
- Create: `src/components/SendPreviewStep.tsx`
- Test: `tests/send-preview.test.tsx`（新建，jsdom）
- Modify: `src/components/SecurityStep.tsx`（onAnalyze→onNext，移除 analyzing/error）
- Modify: `src/App.tsx`（工厂、confirmView 子态、统计事件、错误分类统计）
- Modify: `package.json`（devDependencies：@testing-library/react、@testing-library/dom、jsdom）
- 不改：`src/types/pipeline.ts`、`src/state/pipeline.ts`（Stage 与 reducer 完全不动）

- [ ] **Step 1: 安装组件测试依赖**

```bash
npm install --save-dev @testing-library/react @testing-library/dom jsdom
```
Expected: 安装成功（三包进入 devDependencies）。

- [ ] **Step 2: 新建 src/components/SendPreviewStep.tsx**

```tsx
import type { AnonymizationOutput } from '../types/student';
import Card from './ui/Card';
import Button from './ui/Button';
import CheckItem from './ui/CheckItem';

/** 绝不发送的字段清单（与 field-policies 的删除分类对应；发送侧白名单见 payload.ts SENT_FIELDS） */
const NOT_SENT_ITEMS = [
  '学生姓名', '身份证号', '电话号码', 'QQ', '微信', '邮箱',
  '详细家庭住址', '家访教师/审批人姓名', '珍珠号',
  '原始 Excel 文件本身', '表格中无法识别的未知字段',
];

/**
 * 发送数据预览（scanned 阶段 confirm 视图子态）。
 * 安全红线：本组件挂载本身零网络调用，绝不自动发送——
 * 只有用户点击「确认并开始 AI 分析」才触发 onConfirm（即 App.handleAnalyze）。
 */
export default function SendPreviewStep({
  output, meta, analyzing, error, onBack, onConfirm,
}: {
  output: AnonymizationOutput;
  meta: { schoolName: string; cohort: string };
  analyzing: boolean;
  error?: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">发送数据预览（发送前最终确认）</h2>
      <p className="mt-1 text-sm text-slate-500">
        以下内容将发送至指定分析服务器。发送前已通过三道安全检查；系统不会自动发送，请确认后手动开始。
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-700">将发送内容</p>
        <ul className="mt-2 space-y-1 text-slate-600">
          <li>· 学校名称（脱敏）：{meta.schoolName}</li>
          <li>· 届别：{meta.cohort}</li>
          <li>· 学生人数：{output.students.length} 人</li>
          <li>· 每名学生：34 个已脱敏字段（匿名编号 student-001 起，仅本次会话内存有效）</li>
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-800">以下内容绝不会发送</p>
        <ul className="mt-2">
          {NOT_SENT_ITEMS.map((label) => <CheckItem key={label} label={label} ok />)}
        </ul>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="secondary" onClick={onBack} disabled={analyzing}>返回检查</Button>
        <Button onClick={onConfirm} disabled={analyzing}>
          {analyzing ? 'AI 分析中，请勿关闭页面…' : '确认并开始 AI 分析'}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 3: 新建 tests/send-preview.test.tsx**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SendPreviewStep from '../src/components/SendPreviewStep';
import type { AnonymizationOutput } from '../src/types/student';

const output: AnonymizationOutput = {
  students: [],
  stats: {
    rawStudentCount: 0, rawFieldCount: 0, sensitiveFieldCount: 0,
    droppedFieldCount: 0, generalizedFieldCount: 0, sentFieldCount: 0,
  },
  nameIndex: new Map(),
};

const meta = { schoolName: '某中学', cohort: '2026级' };

describe('SendPreviewStep', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('挂载时零回调零网络（绝不自动发送）', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onConfirm = vi.fn();
    render(
      <SendPreviewStep output={output} meta={meta} analyzing={false}
        onBack={() => {}} onConfirm={onConfirm} />,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('渲染将发送摘要与绝不发送清单', () => {
    render(
      <SendPreviewStep output={output} meta={meta} analyzing={false}
        onBack={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByText('发送数据预览（发送前最终确认）')).toBeTruthy();
    expect(screen.getByText(/学校名称（脱敏）：某中学/)).toBeTruthy();
    expect(screen.getByText('学生姓名')).toBeTruthy();
    expect(screen.getByText('珍珠号')).toBeTruthy();
    expect(screen.getByText('原始 Excel 文件本身')).toBeTruthy();
  });

  it('点击确认 → 触发 onConfirm（唯一分析入口）', () => {
    const onConfirm = vi.fn();
    render(
      <SendPreviewStep output={output} meta={meta} analyzing={false}
        onBack={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByText('确认并开始 AI 分析'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('点击返回检查 → 触发 onBack', () => {
    const onBack = vi.fn();
    render(
      <SendPreviewStep output={output} meta={meta} analyzing={false}
        onBack={onBack} onConfirm={() => {}} />,
    );
    fireEvent.click(screen.getByText('返回检查'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('analyzing 时两按钮禁用且展示进行中文案', () => {
    const onBack = vi.fn();
    const onConfirm = vi.fn();
    render(
      <SendPreviewStep output={output} meta={meta} analyzing
        onBack={onBack} onConfirm={onConfirm} />,
    );
    const confirm = screen.getByText('AI 分析中，请勿关闭页面…') as HTMLButtonElement;
    const back = screen.getByText('返回检查') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(back.disabled).toBe(true);
    fireEvent.click(confirm);
    fireEvent.click(back);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('error 文案渲染（分类文案直显，不二次包装）', () => {
    render(
      <SendPreviewStep output={output} meta={meta} analyzing={false} error="分析请求超时，请稍后重试。"
        onBack={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByText('分析请求超时，请稍后重试。')).toBeTruthy();
  });
});
```

- [ ] **Step 4: 运行确认失败**

```bash
npx vitest run tests/send-preview.test.tsx
```
Expected: FAIL——`../src/components/SendPreviewStep` 不存在（Step 2 已建文件但测试先跑确认渲染行为；若此时通过则说明组件已存在，跳到 Step 6）。注意：本任务 Step 2 与 Step 3 顺序固定（先建组件再建测试），若测试意外失败于断言而非模块缺失，检查组件代码后再继续。

- [ ] **Step 5: 修改 src/components/SecurityStep.tsx（onAnalyze→onNext）**

三处修改：

① props 类型（第 22-32 行）由：

```tsx
export default function SecurityStep({
  output, scan, onAnalyze, analyzing, error, onReset,
}: {
  output: AnonymizationOutput;
  /** scanned 阶段一定携带扫描结果（pipeline 判别联合保证），无「未扫描」态 */
  scan: SecurityScanResult;
  onAnalyze: () => void;
  analyzing: boolean;
  error?: string;
  onReset: () => void;
}) {
```

改为：

```tsx
export default function SecurityStep({
  output, scan, onNext, onReset,
}: {
  output: AnonymizationOutput;
  /** scanned 阶段一定携带扫描结果（pipeline 判别联合保证），无「未扫描」态 */
  scan: SecurityScanResult;
  /** 进入发送预览（扫描通过后），分析由 SendPreviewStep 手动确认触发 */
  onNext: () => void;
  onReset: () => void;
}) {
```

② 按钮（第 52-56 行）由：

```tsx
            <div className="mt-4">
              <Button onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? 'AI 分析中…' : '开始 AI 分析'}
              </Button>
            </div>
```

改为：

```tsx
            <div className="mt-4">
              <Button onClick={onNext}>下一步：发送预览</Button>
            </div>
```

③ 删除错误行（第 85 行）：

```tsx
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
```

- [ ] **Step 6: 修改 src/App.tsx（工厂 + confirm 子态 + 统计事件）**

六处修改：

① 顶部 import（第 8-9 行）由：

```ts
import { AnalysisService } from './analysis/analysis-service';
import { MockAnalysisProvider } from './analysis/mock-provider';
```

改为：

```ts
import { createAnalysisService } from './analysis/provider-factory';
import { AnalysisClientError } from './analysis/analysis-client';
import { SecurityViolationError } from './analysis/analysis-service';
```

并新增组件 import（第 19 行后）：

```ts
import SendPreviewStep from './components/SendPreviewStep';
```

② 模块级单例（第 23 行）由：

```ts
const analysisService = new AnalysisService(new MockAnalysisProvider());
```

改为：

```ts
// provider 种类由环境变量决定（mock 默认 / real），网络 provider 仅工厂内部构造
const analysisService = createAnalysisService();
```

③ 组件状态（第 34 行后）新增 confirm 子态：

```ts
  const [confirmView, setConfirmView] = useState(false);
```

④ `handleScan`（第 76-81 行）在 dispatch 前加一行重置子态：

```ts
    setConfirmView(false);
    dispatch({ type: 'SCAN_SUCCEEDED', output: state.output, scan });
```

⑤ `handleAnalyze`（第 83-106 行）整体替换为：

```ts
  const handleAnalyze = useCallback(async () => {
    if (state.stage !== 'scanned' || !state.scan.passed || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(undefined);
    usageStats.record('analysisStarted');
    try {
      const request = { meta: metaRef.current, students: state.output.students };
      const result = await analysisService.analyze(request, nameBlacklistRef.current);
      const report = generateReport(result, metaRef.current, new Date(), state.output.students);
      usageStats.record('analysisSucceeded');
      dispatch({
        type: 'ANALYSIS_SUCCEEDED',
        output: state.output,
        scan: state.scan,
        result,
        report,
      });
    } catch (e) {
      // 统计只记录错误类别（白名单），绝不含服务端错误原文
      const category =
        e instanceof AnalysisClientError ? e.category
          : e instanceof SecurityViolationError ? 'security'
            : 'unknown';
      usageStats.record('analysisFailed', { errorCategory: category });
      // 错误文案：client 与安全检查错误的消息即分类文案，直显不包装
      setAnalyzeError(e instanceof Error ? e.message : 'AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [state, analyzing]);
```

⑥ `handleReset`（第 108-116 行）加一行：

```ts
    setConfirmView(false);
```

⑦ 渲染区 scanned 分支（第 140-149 行）由：

```tsx
        {state.stage === 'scanned' && (
          <SecurityStep
            output={state.output}
            scan={state.scan}
            onAnalyze={() => void handleAnalyze()}
            analyzing={analyzing}
            error={analyzeError}
            onReset={handleReset}
          />
        )}
```

改为：

```tsx
        {state.stage === 'scanned' && !confirmView && (
          <SecurityStep
            output={state.output}
            scan={state.scan}
            onNext={() => setConfirmView(true)}
            onReset={handleReset}
          />
        )}
        {state.stage === 'scanned' && confirmView && (
          <SendPreviewStep
            output={state.output}
            meta={metaRef.current}
            analyzing={analyzing}
            error={analyzeError}
            onBack={() => setConfirmView(false)}
            onConfirm={() => void handleAnalyze()}
          />
        )}
```

- [ ] **Step 7: 运行验证通过**

```bash
npx vitest run tests/send-preview.test.tsx
```
Expected: PASS。

- [ ] **Step 8: 全量验证 + 提交**

```bash
npm run build
npm test
git add src/components/SendPreviewStep.tsx src/components/SecurityStep.tsx src/App.tsx tests/send-preview.test.tsx package.json package-lock.json
git commit -m "feat: 发送数据预览与手动确认（scanned 阶段 confirm 子态，绝不自动发送）

- SendPreviewStep：将发送摘要 + 绝不发送清单 + 返回检查/确认并开始 AI 分析
- SecurityStep 按钮改为进入预览；Stage 与 reducer 不动
- App：工厂接入、统计三事件、失败按类别记录（security/network/…/unknown）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 文档与收尾（README、全量回归、特别安全测试七项核对）

**Files:**
- Modify: `README.md`
- 无代码变更（本任务为文档 + 验证）

- [ ] **Step 1: 更新 README.md**

在 README 末尾追加「第二阶段：真实 AI 分析」章节：

```markdown
## 第二阶段：真实 AI 分析（DeepSeek 经分析服务器中转）

数据只在本地脱敏 + 三道安全检查通过后，才发送到**指定分析服务器**。协议契约、
服务端提示词约束与实现须知见 `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md`。

### 环境变量（构建期注入，绝不含 API Key）

| 变量 | 说明 | 默认 |
|---|---|---|
| `VITE_ANALYSIS_PROVIDER` | `mock`（本地规则引擎）或 `real`（真实 AI） | `mock` |
| `VITE_ANALYSIS_API_URL` | 分析服务器完整端点（real 时必填） | 空 |
| `VITE_ANALYSIS_TIMEOUT_MS` | 请求超时毫秒数 | `30000` |

- **API Key 只配置在分析服务器端**，前端绝不保存任何 Key（浏览器环境变量会进入构建产物）。
- `real` 但未配置地址时自动回退 Mock 并在控制台提示。
- 可复制 `.env.example` 为 `.env` 按需修改（`.env*` 已被 gitignore，`.env.example` 除外）。

### 发送前确认

安全检查通过后必须手动点击「确认并开始 AI 分析」才会发送；发送前预览页列出
「绝不发送」字段清单（姓名/证件/电话/住址/教师姓名/珍珠号/原始文件等）。
AI 分析结果只存当前页面内存，刷新即失；报告需手动下载。
```

- [ ] **Step 2: 全量回归**

```bash
npm run build
npm test
```
Expected: tsc 通过、全部测试绿（含 119 个第一阶段用例改造 + 第二阶段新增用例）。

- [ ] **Step 3: 特别安全测试七项核对（对照设计文档 8.3，逐项人工核对执行记录）**

按下列核对表逐项确认对应测试文件存在且用例覆盖（不新增代码）：

| # | 要求 | 核对位置 |
|---|---|---|
| 1 | 假身份证/手机号/姓名/地址拦截 | `tests/scanner.test.ts`、`tests/payload.test.ts`（scanOutboundPayload 用例）、`tests/deepseek-provider.test.ts`（重扫用例） |
| 2 | 绕过 UI 直调 provider 也被扫描 | `tests/deepseek-provider.test.ts` 前两条（fetch 零调用断言） |
| 3 | console.log 不得打印原始数据 | `tests/no-persistence.test.ts`（console.log/info/debug/trace 全局禁止 + RawStudentRecord 引用白名单） |
| 4 | fetch 检查 | `tests/no-persistence.test.ts`（fetch( 仅 analysis-client.ts）+ `AnalysisClient.analyze` 签名只接受 `WireAnalysisRequest` |
| 5 | localStorage/indexedDB 不接触数据 | `tests/no-persistence.test.ts`（持久化 API 全局禁止） |
| 6 | 逐项搜索 localStorage/indexedDB/fetch/axios/XMLHttpRequest/console.log | `tests/no-persistence.test.ts`（自动化守卫） |
| 7 | 端到端：含敏感串数据经完整管线后出站被拦截 | `tests/payload.test.ts` + `tests/deepseek-provider.test.ts` + `tests/provider-factory.test.ts` 末条（真实 provider 下硬闸仍生效） |

核对结果记录在本任务提交信息中。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: README 第二阶段说明（环境变量/手动确认/内存态报告）

特别安全测试七项核对完成：全部有对应测试覆盖（守卫/出站终扫/重扫/硬闸）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 全部任务完成后的收尾（执行者负责，不属任务步骤）

1. 全量 `npm run build` + `npm test` 最终确认。
2. 按设计文档第 11 节输出 **10 项汇报**：
   1. 新增/修改模块与文件清单（含测试文件）
   2. 数据流与三重安全扫描链验证结果（哪些测试覆盖）
   3. 协议契约摘要（请求/响应/版本/错误码/JSON 修复）
   4. UI 流程说明（发送预览、手动确认机制、报告展开）
   5. 错误分类文案表落地情况（七类）
   6. 统计事件与日志白名单执行情况
   7. 测试结果：总数 / 新增数 / 失败数
   8. 特别安全测试 7 项逐项结果
   9. 环境变量配置说明（三变量、无 Key、回退行为）
   10. 服务端实现须知与对接指引（指向设计文档 4.5）
3. 随后进入 finishing-a-development-branch 流程（合并/PR 等由用户选择）。

## 计划自审记录（writing-plans Self-Review）

**Spec 覆盖核对**（设计文档章节 → 计划任务）：
- 4.1 请求协议 → Task 3（createAnalysisPayload/SENT_FIELDS）；4.2 响应契约 → Task 3（zod）；4.3 错误分类 → Task 5（CATEGORY_MESSAGES）；4.4 JSON 修复 → Task 3（parseResponseText）+ Task 5（client 接线）；4.5 服务端须知 → 设计文档原文（无需代码）
- 5.1 四模块分层 → Task 3/5/6/7；5.2 三重扫描 → Task 2（豁免参数）+ Task 6（重扫/终扫）；5.3 工厂与环境变量 → Task 7；5.4 统一新结构 → Task 1；5.5 Mock 映射 → Task 1
- 6.1 发送预览 → Task 9；6.2 报告展示 → Task 1
- 7.1 统计 → Task 8 + Task 9（App 接线）；7.2 日志白名单 → Task 4（守卫）+ Task 7（console.warn 仅常量）
- 8.1-8.3 测试策略 → 各任务测试文件 + Task 10 七项核对；8.4 依赖 → Task 9 Step 1（zod 已在 package.json，Task 1 Step 1 验证）
- 9 文件清单 → 各任务 Files 段完整覆盖
- 第 2 节安全红线：红线 1-10 分别由守卫/硬闸/重扫/终扫/不自动发送测试/无 Key 变量覆盖

**类型一致性**：`SchoolAnalysis/StudentAnalysis/DifficultyFactor/Importance`（Task 1 定义）在 Task 3 payload.ts 的 zod schema、Task 5/6 的 wire 响应使用中字段名一致（studentId/summary/familySituation/mainDifficultyFactors{factor,evidence,importance}/informationToVerify/interviewQuestions/interviewNotes）；`AnalysisClientError.category`/`CATEGORY_MESSAGES`（Task 5）在 Task 6/9 引用一致；`createAnalysisPayload(request, requestId)`/`scanOutboundPayload`（Task 3）在 Task 6 调用签名一致；`createAnalysisService(config)`（Task 7）在 Task 9 App 调用一致；`generateReport(result, meta, now, studentsData)`（Task 1）在 Task 9 App 调用一致；`UsageEvent` 新事件（Task 8）在 Task 9 调用一致。

**已知执行注意**：
- Task 1 Step 2 的测试文件先不含 payload import，Task 3 Step 5 加回（计划正文已注明）。
- Task 9 Step 4 的组件测试与组件同任务创建，步骤顺序为「先建组件再建测试」，运行时直接验证通过（该步预期写明两种情形）。
- 所有 vitest 命令在 Windows Git Bash 执行；EPERM 偶发时重试同命令。

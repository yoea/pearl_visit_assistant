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

  it('Mock 输出通过 wire 响应契约校验（与真实 provider 同构）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const r = wireResponseSchema.safeParse({ version: PROTOCOL_VERSION, ...result });
    expect(r.success).toBe(true);
  });
});

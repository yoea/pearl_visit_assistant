import { describe, it, expect } from 'vitest';
import { MockAnalysisProvider } from '../src/analysis/mock-provider';
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

describe('MockAnalysisProvider', () => {
  it('学校级统计正确', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([
      student(),
      student({ anonymousId: 'student-002', perCapitaIncome: 20000, familySituation: '健康', difficultyReason: '无', debtStatus: '无负债', housingStatus: '自建房', distanceToSchoolKm: 1, schoolChildrenCount: 1, elderlySupportStatus: null, elderlySupportNote: null }),
    ]));
    expect(result.school.studentCount).toBe(2);
    expect(result.school.lowIncomeCount).toBe(1);
    expect(result.school.majorIllnessCount).toBe(1);
    expect(result.school.highDebtCount).toBe(1);
    expect(result.school.rentalCount).toBe(1);
    expect(result.school.longDistanceCount).toBe(1);
    expect(result.school.focusStudentIds).toEqual(['student-001']);
  });

  it('学生级：困难因素按权重降序', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const guide = result.students[0];
    const weights = guide.difficultyFactors.map((f) => f.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(guide.difficultyFactors.length).toBeGreaterThan(0);
  });

  it('学生级：推荐问题 5-8 个，均为中性问题', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const qs = result.students[0].suggestedQuestions;
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(8);
    for (const q of qs) {
      expect(q).not.toMatch(/是不是因为|一定|肯定|困难吗|可怜/);
    }
  });

  it('涉及疾病时给出注意事项', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    expect(result.students[0].cautions.length).toBeGreaterThan(0);
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

  it('材料缺失被计入完整度', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const missing = result.school.completeness.perStudent[0].missingCount;
    expect(missing).toBeGreaterThan(0); // annualIncomeNote/approvalComment 等为 null
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
    expect(result.students[0].difficultyFactors).toHaveLength(0);
  });
});

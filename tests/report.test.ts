import { describe, it, expect } from 'vitest';
import { generateReport } from '../src/report/generator';
import { reportToMarkdown } from '../src/report/markdown';
import { MockAnalysisProvider } from '../src/analysis/mock-provider';
import type { AnonymizedStudent, AnalysisRequest } from '../src/types/student';

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

describe('generateReport + reportToMarkdown', () => {
  it('生成报告模型', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [sampleStudent],
    } satisfies AnalysisRequest);
    const report = generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00'));
    expect(report.schoolName).toBe('某中学');
    expect(report.studentGuides).toHaveLength(1);
  });

  it('Markdown 含两级结构与附录', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [sampleStudent],
    } satisfies AnalysisRequest);
    const report = generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00'));
    const md = reportToMarkdown(report);
    expect(md).toContain('# 走访参考报告');
    expect(md).toContain('## 一、学校整体情况');
    expect(md).toContain('### student-001');
    expect(md).toContain('## 三、通用面谈指南');
    expect(md).toContain('2026-08-21');
  });

  it('Markdown 不含真实身份信息与结论性表述', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [sampleStudent],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00')));
    expect(md).not.toMatch(/1[3-9]\d{9}/);
    expect(md).not.toMatch(/\d{17}[\dXx]/);
    expect(md).not.toContain('建议通过');
    expect(md).not.toContain('建议淘汰');
  });
});

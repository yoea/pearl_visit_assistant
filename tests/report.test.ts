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

  it('动态文本的 Markdown 转义（行首 #/*/>/与换行不破坏结构）', async () => {
    const adversarial: AnonymizedStudent = {
      ...sampleStudent,
      applicationReason: '# 请优先面谈\n> 需重点核实\n* 家长关注',
      housingStatus: '自建房\n（两层）',
    };
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [adversarial],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00')));
    // 行首标记被转义：不再生成标题/引用/列表
    expect(md).toContain('\\# 请优先面谈');
    expect(md).not.toMatch(/^# 请优先面谈/m);
    // 换行被折叠为空格：内容保留在同一行内（不再打散段落结构）
    expect(md).toContain('\\# 请优先面谈 > 需重点核实 * 家长关注');
    expect(md).toContain('住房状况：自建房 （两层）');
  });

  it('空学生列表不崩溃（0.0% 占比）且困难分布给出占位文案', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00')));
    expect(md).toContain('0.0%');
    expect(md).toContain('材料中未填写困难度，且未识别出明显困难类型');
  });

  it('建议/问题/基本信息为空数组时给出占位文案（未来 DeepSeek 空输出不悬挂标题）', () => {
    const report: Report = {
      title: '走访参考报告', schoolName: '某中学', cohort: '2026级',
      generatedAt: '2026-08-21 10:00',
      overview: {
        studentCount: 1, difficultyDistribution: { '一级困难': 1 }, lowIncomeCount: 0,
        lowIncomeRatio: 0, majorIllnessCount: 0, singleParentOrWeakLaborCount: 0,
        highDebtCount: 0, rentalCount: 0, longDistanceCount: 0,
        completeness: { totalFields: 34, perStudent: [], averageMissing: 0 },
        focusStudentIds: [], suggestions: [],
      },
      studentGuides: [{
        anonymousId: 'student-001', basicInfo: [],
        reasonSummary: '材料中未填写申请理由。', familySummary: '材料中未填写家庭情况。',
        difficultyFactors: [], verificationPoints: [], suggestedQuestions: [], cautions: [],
      }],
    };
    const md = reportToMarkdown(report);
    // 学校级建议、学生级基本情况、推荐问题三处空态
    expect(md).toContain('### 10. 整体面谈建议\n\n- 暂无。');
    expect(md).toContain('#### 1. 基本情况\n\n- 暂无。');
    expect(md).toContain('#### 6. 推荐面谈问题\n\n- 暂无。');
  });
});

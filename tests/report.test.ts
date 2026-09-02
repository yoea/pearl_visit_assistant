import { describe, it, expect } from 'vitest';
import { generateReport } from '../src/report/generator';
import { reportToMarkdown } from '../src/report/markdown';
import { reportToHtml, escapeHtml } from '../src/report/html';
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

  it('传入 nameIndex 时学生标题显示真实姓名并附匿名编号', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(
      generateReport(result, meta, now, [sampleStudent]),
      new Map([['student-001', '测试甲']]),
    );
    expect(md).toContain('### 测试甲（student-001）');
    expect(md).not.toMatch(/^### student-001$/m);
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

  it('困难类型分布行也做 Markdown 转义（difficultyLevel 换行不破坏结构）', async () => {
    const adversarial: AnonymizedStudent = {
      ...sampleStudent,
      difficultyLevel: '特别困难\n# 假标题',
    };
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [adversarial],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, meta, now, [adversarial]));
    expect(md).toContain('特别困难 # 假标题：1人');
    expect(md).not.toMatch(/^# 假标题/m);
  });

  it('HTML 为完全自包含单文件（含姓名、图表，无外部资源引用）', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const html = reportToHtml(
      generateReport(result, meta, now, [sampleStudent]),
      new Map([['student-001', '测试甲']]),
    );
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('测试甲（student-001）');
    expect(html).toContain('走访参考报告');
    expect(html).toContain('困难类型分布');
    expect(html).not.toMatch(/https?:\/\//); // 零外部依赖（无 CDN/图片/脚本外链）
    expect(html).not.toContain('建议通过');
    expect(html).not.toContain('建议淘汰');
  });

  it('HTML 学生明细为卡片化布局（编号问题圆点/重点困难条/因素小卡）', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [sampleStudent],
    } satisfies AnalysisRequest);
    const html = reportToHtml(generateReport(result, meta, now, [sampleStudent]));
    expect(html).toContain('class="questions"');
    expect(html).toContain('class="num"'); // 问题编号圆点
    expect(html).toContain('class="factor"'); // 困难因素小卡
    expect(html).toContain('class="textcard"'); // 文本卡片
    expect(html).toContain('class="card-warn"'); // 红色核实卡
    expect(html).toContain('class="tc-icon"'); // 文本卡片带图标（与页面一致）
    expect(html).not.toContain('list-style:decimal'); // 不再使用纯数字列表
    // 移动端适配媒体查询
    expect(html).toContain('@media (max-width: 640px)');
    // 基本情况折叠（与页面一致：默认收起，点击展开）
    expect(html).toContain('class="fold-head"');
    expect(html).toContain('class="fold-body" hidden');
    expect(html).toContain('fold-toggle');
  });

  it('HTML 基本情况含数字校验标注（异常值附「疑似填写错误待核实」）', async () => {
    const bad: AnonymizedStudent = {
      ...sampleStudent,
      weight: '105kg', annualIncome: 1,
    };
    const result = await new MockAnalysisProvider().analyze({
      meta, students: [bad],
    } satisfies AnalysisRequest);
    const html = reportToHtml(generateReport(result, meta, now, [bad]));
    expect(html).toContain('105kg <span class="badge-warn">疑似填写错误待核实</span>');
    expect(html).toContain('>1 <span class="badge-warn">疑似填写错误待核实</span>');
  });

  it('escapeHtml 转义动态文本（防止内容破坏 HTML 结构）', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('a"b&c')).toBe('a&quot;b&amp;c');
  });
});

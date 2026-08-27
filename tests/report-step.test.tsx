// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import ReportStep, { fieldAnomalyOf } from '../src/components/ReportStep';
import type { Report } from '../src/report/types';
import type { AnonymizedStudent } from '../src/types/student';

/** 单位混淆数据：身高 1.65（米）、体重 105（斤）、人均收入高于年收入 */
const studentDataBad: AnonymizedStudent = {
  anonymousId: 'student-004', gender: '男', ethnicity: '汉族', householdType: '农村',
  height: '1.65', weight: '105', healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 2000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

/** 本地脱敏数据：student-001 人均年收入 0.2（明显异常），身高体重正常 */
const studentData001: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: '174cm', weight: '56kg', healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 30000, annualIncomeNote: null, perCapitaIncome: 0.2,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const nameIndex = new Map([
  ['student-001', '王小明'],
  ['student-002', '李王'],
  ['student-003', '张三'],
]);

const report: Report = {
  title: '走访参考报告', schoolName: '某中学', cohort: '2026级',
  generatedAt: '2026-08-27 10:00',
  schoolAnalysis: {
    overview: '本校共 3 名候选学生。', studentCount: 3,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [
    {
      studentId: 'student-001', summary: '母亲患心脏病', familySituation: '单亲',
      mainDifficultyFactors: [], informationToVerify: [],
      interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
    },
    {
      studentId: 'student-002', summary: '收入单一', familySituation: '多子女',
      mainDifficultyFactors: [], informationToVerify: [],
      interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
    },
    {
      studentId: 'student-003', summary: 's', familySituation: 'f',
      mainDifficultyFactors: [], informationToVerify: [],
      interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
    },
  ],
  studentsData: [studentData001],
};

const reportBad: Report = {
  title: '走访参考报告', schoolName: '某中学', cohort: '2026级',
  generatedAt: '2026-08-27 10:00',
  schoolAnalysis: {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [{
    studentId: 'student-004', summary: 's', familySituation: 'f',
    mainDifficultyFactors: [], informationToVerify: [],
    interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
  }],
  studentsData: [studentDataBad],
};

const renderStep = (props: Record<string, unknown> = {}) =>
  render(
    <ReportStep report={report} nameIndex={nameIndex} tokenStats={null} onReset={() => {}}
      {...(props as Partial<Parameters<typeof ReportStep>[0]>)} />,
  );

describe('ReportStep（本地查找 + 模态框 + 成功动画）', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('输入姓名实时下拉显示所有匹配（输入「王」→ 王小明 + 李王，张三不出现）', () => {
    renderStep();
    const input = screen.getByPlaceholderText(/输入学生姓名的一部分/);
    fireEvent.change(input, { target: { value: '王' } });
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('王小明')).toBeTruthy();
    expect(within(listbox).getByText('李王')).toBeTruthy();
    expect(within(listbox).queryByText('张三')).toBeNull();
    expect(within(listbox).getByText('student-001')).toBeTruthy(); // 条目带编号
  });

  it('无匹配时下拉显示「未找到匹配的学生」', () => {
    renderStep();
    const input = screen.getByPlaceholderText(/输入学生姓名的一部分/);
    fireEvent.change(input, { target: { value: '不存在' } });
    expect(within(screen.getByRole('listbox')).getByText('未找到匹配的学生')).toBeTruthy();
  });

  it('点下拉条目 → 模态框显示该学生完整信息；关闭按钮可关', () => {
    renderStep();
    const input = screen.getByPlaceholderText(/输入学生姓名的一部分/);
    fireEvent.change(input, { target: { value: '王小明' } });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('王小明'));
    // 模态框出现：姓名 + 信息区块（区块标题仅模态框/展开卡有）
    expect(screen.getAllByText('王小明').length).toBeGreaterThan(0);
    expect(screen.getByText('材料要点摘要')).toBeTruthy();
    expect(screen.getByText('家庭情况概括')).toBeTruthy();
    // 关闭
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(screen.queryByText('材料要点摘要')).toBeNull();
  });

  it('「查看」按钮打开第一个匹配学生的模态框；无匹配时禁用', () => {
    renderStep();
    const viewBtn = () => screen.getByRole('button', { name: '查看' }) as HTMLButtonElement;
    expect(viewBtn().disabled).toBe(true); // 未输入时禁用
    const input = screen.getByPlaceholderText(/输入学生姓名的一部分/);
    fireEvent.change(input, { target: { value: '王' } });
    expect(viewBtn().disabled).toBe(false);
    fireEvent.click(viewBtn());
    // 第一个匹配是王小明（student-001）：模态框显示其材料要点
    expect(screen.getByText('材料要点摘要')).toBeTruthy();
  });

  it('分析完成庆祝动画：非存档视图显示「分析完成！」浮层，数秒后自动消失', async () => {
    vi.useFakeTimers();
    renderStep();
    expect(screen.getByText('分析完成！')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(4000);
    expect(screen.queryByText('分析完成！')).toBeNull();
  });

  it('存档读取视图（archived）不显示庆祝动画', () => {
    renderStep({ archived: true });
    expect(screen.queryByText('分析完成！')).toBeNull();
    expect(screen.getByText('已从本地存档读取报告')).toBeTruthy();
  });

  it('异常字段标注：人均年收入 0.2 → 「疑似填写错误待核实」标签；正常字段不标注', () => {
    renderStep();
    // 打开王小明（student-001）的模态框
    const input = screen.getByPlaceholderText(/输入学生姓名的一部分/);
    fireEvent.change(input, { target: { value: '王小明' } });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('王小明'));
    // 异常值（人均年收入 0.2 元）被标注
    expect(screen.getByText('人均年收入(元)')).toBeTruthy();
    expect(screen.getByText('0.2')).toBeTruthy();
    expect(screen.getAllByText('疑似填写错误待核实').length).toBeGreaterThan(0);
    // 正常字段（身高 174cm / 年收入 30000）不标注
    expect(screen.getByText('身高')).toBeTruthy();
    expect(screen.getByText('174cm')).toBeTruthy();
    expect(screen.getByText('年收入(元)')).toBeTruthy();
    expect(screen.getByText('30000')).toBeTruthy();
    // 标注数恰为 1（只有人均年收入异常）
    expect(screen.getAllByText('疑似填写错误待核实')).toHaveLength(1);
  });

  it('单位混淆校验：身高 1.65（米）、体重 105（斤）、人均收入高于年收入 → 全部标注', () => {
    const nameIndexBad = new Map([['student-004', '李四']]);
    render(<ReportStep report={reportBad} nameIndex={nameIndexBad} tokenStats={null} onReset={() => {}} />);
    const input = screen.getByPlaceholderText(/输入学生姓名的一部分/);
    fireEvent.change(input, { target: { value: '李四' } });
    fireEvent.click(within(screen.getByRole('listbox')).getByText('李四'));
    // 三个异常字段各一个标签
    expect(screen.getByText('1.65')).toBeTruthy();
    expect(screen.getByText('105')).toBeTruthy();
    expect(screen.getByText('8000')).toBeTruthy();
    expect(screen.getAllByText('疑似填写错误待核实')).toHaveLength(3);
  });

  it('「数字+单位」格式识别：105kg 标注、56kg 不标注；全角数字可识别；千分位不误伤', () => {
    const make = (weight: string, annualIncome: number | null): AnonymizedStudent => ({
      ...studentData001, anonymousId: 'student-005', weight, annualIncome,
    });
    // 105kg（带单位，模拟真实表数据）→ 标注
    const w105 = make('105kg', 30000);
    expect(fieldAnomalyOf('weight', String(w105.weight), w105)).toBe('疑似填写错误待核实');
    // 56kg → 不标注
    const w56 = make('56kg', 30000);
    expect(fieldAnomalyOf('weight', String(w56.weight), w56)).toBeNull();
    // 全角数字 '１０５kg' → 标注（全角转半角后解析）
    const wFull = make('１０５kg', 30000);
    expect(fieldAnomalyOf('weight', String(wFull.weight), wFull)).toBe('疑似填写错误待核实');
    // 千分位年收入 '1,000' 元 → 解析为 1000，不误伤（不在 <500 区间）
    const incomeK = { ...studentData001, annualIncome: null } as AnonymizedStudent;
    expect(fieldAnomalyOf('annualIncome', '1,000', incomeK)).toBeNull();
    // 纯数字 105 → 标注（不带单位也识别）
    const wPlain = make('105', 30000);
    expect(fieldAnomalyOf('weight', String(wPlain.weight), wPlain)).toBe('疑似填写错误待核实');
  });
});

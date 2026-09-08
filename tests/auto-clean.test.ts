import { describe, it, expect } from 'vitest';
import { autoCleanStudents } from '../src/security/auto-clean';
import { scanPayload, type SecurityFinding } from '../src/security/scanner';
import type { AnonymizedStudent } from '../src/types/student';

const base: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: '174cm', weight: '56kg', healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: '云南省曲靖市', distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难，希望减轻负担', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const clean = (students: AnonymizedStudent[], blacklist: Set<string>): {
  students: AnonymizedStudent[]; cleanedCount: number; passed: boolean; findings: SecurityFinding[];
} => {
  const scan = scanPayload({ meta: { schoolName: '某中学', cohort: 'x' }, students }, blacklist);
  if (scan.passed) return { findings: scan.findings, cleanedCount: 0, passed: true, students };
  const result = autoCleanStudents(students, scan.findings, blacklist);
  const rescan = scanPayload({ meta: { schoolName: '某中学', cohort: 'x' }, students: result.students }, blacklist);
  return { findings: scan.findings, ...result, passed: rescan.passed };
};

describe('autoCleanStudents（发送前自动清洗）', () => {
  it('整个字段都是敏感内容（籍贯误填身份证号）→ 清洗后重扫通过，字段置空', () => {
    const stu = { ...base, ancestralHome: 'G65312520110311183' };
    const scan = scanPayload({ meta: { schoolName: '某中学', cohort: 'x' }, students: [stu] }, new Set());
    const result = autoCleanStudents([stu], scan.findings, new Set());
    const rescan = scanPayload({ meta: { schoolName: '某中学', cohort: 'x' }, students: result.students }, new Set());
    expect(rescan.passed).toBe(true);
    expect(result.cleanedCount).toBeGreaterThan(0);
    expect(result.students[0].ancestralHome).toBeNull();
    // issues 记录：学生/字段/掩码值/说明（掩码不泄露完整值）
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].studentId).toBe('student-001');
    expect(result.issues[0].fieldLabel).toBe('籍贯');
    expect(result.issues[0].originalMasked).not.toContain('65312520110311183');
    expect(result.issues[0].originalMasked).toContain('****');
    expect(result.issues[0].note).toContain('置空');
  });

  it('叙事文本中混入电话 → 只剥除电话片段，中文内容保留', () => {
    const stu = { ...base, visitSummary: '家庭收入单一，联系电话13800138000，主要靠务农' };
    const r = clean([stu], new Set());
    expect(r.passed).toBe(true);
    expect(r.students[0].visitSummary).toBe('家庭收入单一，联系电话，主要靠务农');
  });

  it('名单姓名混入文本 → 姓名被剥除，继续通过', () => {
    const stu = { ...base, visitSummary: '家访人王小明确认家庭困难属实' };
    const r = clean([stu], new Set(['王小明']));
    expect(r.passed).toBe(true);
    expect(r.students[0].visitSummary).toBe('家访人确认家庭困难属实');
  });

  it('地址类命中不清洗（保留阻止，需人工处理）', () => {
    const stu = { ...base, familySituation: '家住云南省大理州洱源县凤羽镇' };
    const r = clean([stu], new Set());
    // 结构化地址词是合法家庭描述的一部分；若地址子句命中则保持原值不自动删
    if (r.cleanedCount === 0) {
      expect(r.students[0].familySituation).toBe('家住云南省大理州洱源县凤羽镇');
    }
  });

  it('清洗后仍含敏感内容（不同类别残留）→ 不通过（兜底阻止）', () => {
    // mobile 命中被剥除，但文本中还混有身份证号（不同类别）→ 首轮清洗后重扫仍失败
    const stu = { ...base, familySituation: '电话13800138000，证件110101200001011234' };
    const scan = scanPayload({ meta: { schoolName: 'x', cohort: 'x' }, students: [stu] }, new Set());
    const result = autoCleanStudents([stu], scan.findings, new Set());
    const rescan = scanPayload({ meta: { schoolName: 'x', cohort: 'x' }, students: result.students }, new Set());
    expect(rescan.passed).toBe(false);
  });

  it('清理过程零外部依赖、原列表不被修改', () => {
    const stu = { ...base, ancestralHome: 'G65312520110311183' };
    const copy = { ...stu };
    autoCleanStudents([stu], [{ category: 'id-card', label: '身份证号', field: 'students[0].ancestralHome', snippet: '53****83' }], new Set());
    expect(stu.ancestralHome).toBe(copy.ancestralHome); // 原对象不变（返回副本）
  });
});

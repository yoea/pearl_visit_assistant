import { describe, it, expect } from 'vitest';
import { scanPayload, maskSnippet } from '../src/security/scanner';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const cleanStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: '165cm', weight: '40kg', healthStatus: '健康', difficultyLevel: '一级困难',
  enrollmentStatus: null, province: '黑龙江省', city: '大庆市', county: '杜尔伯特蒙古族自治县',
  ancestralHome: '黑龙江省大庆市', distanceToSchoolKm: 1.4, zhongkaoFullScore: 820,
  zhongkaoScore: 701, admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲心脏病劳动能力弱', visitMethod: '入户家访', visitSummary: '家庭和睦',
  awardsAndInterests: '喜欢读书', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '租房（年租金/元）/10000以下', transportation: '无以上类型车辆',
  annualIncome: 30000, annualIncomeNote: '务农收入', perCapitaIncome: 10000,
  schoolChildrenCount: 1, difficultyReason: '母亲患心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '无负债', debtNote: null,
};

const cleanRequest: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [cleanStudent],
};

describe('maskSnippet', () => {
  it('掩码片段不泄露完整敏感值', () => {
    const s = maskSnippet('110101200001011234');
    expect(s).not.toContain('110101200001011234');
    expect(s).toContain('****');
  });

  it('短值边界：≤4 全掩码，=5 首尾各留 2 位', () => {
    expect(maskSnippet('测试甲')).toBe('****');
    expect(maskSnippet('甲乙丙丁戊')).toBe('甲乙****丁戊');
  });
});

describe('scanPayload', () => {
  it('干净 payload 通过', () => {
    const r = scanPayload(cleanRequest, new Set(['测试甲']));
    expect(r.passed).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('结构化地区字段不误报地址（用户确认保留的区域级信息）', () => {
    expect(scanPayload(cleanRequest, new Set()).passed).toBe(true);
  });

  it('学校名含省市不误报（校名属学校级元数据，经用户同意发送）', () => {
    const r = scanPayload(
      { ...cleanRequest, meta: { schoolName: '大庆市杜尔伯特蒙古族自治县第一中学', cohort: '2026级' } },
      new Set(),
    );
    expect(r.passed).toBe(true);
  });

  it('叙事文本含身份证号 → 拒绝且片段已掩码', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, familySituation: '证件110101200001011234' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('id-card');
    expect(JSON.stringify(r.findings)).not.toContain('110101200001011234');
  });

  it('叙事文本含姓名黑名单中的姓名 → 拒绝', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, visitSummary: '与测试甲同班' }] },
      new Set(['测试甲']),
    );
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.category === 'name-blacklist')).toBe(true);
  });

  it('数字字段不误报（年收入 30000 不是 QQ 号）', () => {
    expect(scanPayload(cleanRequest, new Set()).passed).toBe(true);
  });

  it('禁止字段名出现在 payload → 拒绝', () => {
    const r = scanPayload({ students: [{ 身份证号: 'x', name: 'n' }] }, new Set());
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.category === 'forbidden-field')).toBe(true);
  });

  it('结构化字段含手机号 → 拒绝', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, housingStatus: '电话13800138000' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('mobile');
  });

  it('叙事文本含详细地址片段 → 拒绝', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, visitSummary: '住在南湖回迁一号楼六单元701室' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('address');
  });

  it('地区字段豁免收窄后：含手机号仍拒绝（keep 字段唯一防线）', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, province: '黑龙江省13800138000' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('mobile');
  });

  it('地址词跨子句不误报（与清洗器同源语义）', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, visitSummary: '他住在省里。市里的亲戚常来' }] },
      new Set(),
    );
    expect(r.passed).toBe(true);
  });

  it('数字字段命中身份证规则（18 位纯数字；id-card 规则需 18 字符，1e17 的字符串形式恰为 18 位）', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, perCapitaIncome: 1e17 }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('id-card');
  });

  it('null payload fail-closed（结构异常不抛异常）', () => {
    const r = scanPayload(null, new Set());
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('malformed-payload');
  });

  it('students 含 null 元素不抛异常', () => {
    const r = scanPayload({ ...cleanRequest, students: [null] }, new Set());
    expect(r).toHaveProperty('passed');
  });

  it('连续两次扫描结果一致（共享正则状态不变量）', () => {
    const a = JSON.stringify(scanPayload(cleanRequest, new Set(['测试甲'])));
    const b = JSON.stringify(scanPayload(cleanRequest, new Set(['测试甲'])));
    expect(a).toBe(b);
  });
});

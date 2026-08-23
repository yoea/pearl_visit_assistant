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

  it('interviewQuestions 超过 8 → 拒绝', () => {
    expect(wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis,
      students: [{ ...okStudent, interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'] }],
    }).success).toBe(false);
  });

  it('factor/evidence 空串 → 拒绝', () => {
    expect(wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis,
      students: [{ ...okStudent, mainDifficultyFactors: [{ factor: '', evidence: 'e', importance: 'high' }] }],
    }).success).toBe(false);
    expect(wireResponseSchema.safeParse({
      version: '1.0', schoolAnalysis,
      students: [{ ...okStudent, mainDifficultyFactors: [{ factor: 'x', evidence: '', importance: 'high' }] }],
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

  it('escaped 引号不提前终止字符串（修复后解析成功）', () => {
    expect(parseResponseText('{"a":"\\"}"}')).toEqual({ a: '"}' });
  });
});

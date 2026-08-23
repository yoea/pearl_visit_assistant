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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekAnalysisProvider } from '../src/analysis/deepseek-provider';
import { AnalysisClient, DEEPSEEK_API_URL } from '../src/analysis/analysis-client';
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

/** DeepSeek 响应壳（直连模式）；usage 可选（缺省 = 无 usage 字段） */
function deepseekResponse(content: string, usage?: Record<string, unknown>): Response {
  const shell: Record<string, unknown> = { choices: [{ message: { content } }] };
  if (usage !== undefined) shell.usage = usage;
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify(shell),
  } as Response;
}

function makeProvider(): { provider: DeepSeekAnalysisProvider; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn().mockResolvedValue(deepseekResponse(JSON.stringify(wireResponse(['student-001']))));
  vi.stubGlobal('fetch', fetchMock);
  const client = new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 });
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

  it('通过后 fetch 恰一次，user 消息为脱敏 payload（requestId 为 UUID）', async () => {
    const { provider, fetchMock } = makeProvider();
    const result = await provider.analyze(request);
    expect(result.students[0].studentId).toBe('student-001');
    // 上游未返回 usage 时按 0 聚合（统计不失败，主流程不受影响）
    expect(result.usage).toEqual({ apiCalls: 1, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DEEPSEEK_API_URL);
    const body = JSON.parse(init.body);
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const wire = JSON.parse(body.messages[1].content);
    expect(wire.version).toBe('1.0');
    expect(wire.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(wire.school).toEqual({ name: '某中学', totalStudents: 1 });
    expect(wire.students[0].id).toBe('student-001');
    expect(JSON.stringify(wire)).not.toContain('姓名');
    expect(JSON.stringify(wire)).not.toContain('13800138000');
  });

  it('响应学生集合与请求不一致（缺失学生）→ format 错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse(JSON.stringify(wireResponse([]))));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );
    const err = await provider.analyze(request).catch((e: unknown) => e);
    expect((err as Error).message).toContain('格式异常');
  });

  it('响应含请求中不存在的 studentId → format 错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse(JSON.stringify(wireResponse(['student-999']))));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );
    const err = await provider.analyze(request).catch((e: unknown) => e);
    expect((err as Error).message).toContain('格式异常');
  });

  it('响应含重复 studentId（请求 2 人、响应均为同一 id）→ format 错误（绝不静默丢学生）', async () => {
    const two: AnalysisRequest = {
      ...request,
      students: [cleanStudent, { ...cleanStudent, anonymousId: 'student-002' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse(JSON.stringify(wireResponse(['student-001', 'student-001']))));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );
    const err = await provider.analyze(two).catch((e: unknown) => e);
    expect((err as Error).message).toContain('格式异常');
  });

  it('响应顺序与请求不同（集合一致）→ 通过', async () => {
    const two: AnalysisRequest = {
      ...request,
      students: [cleanStudent, { ...cleanStudent, anonymousId: 'student-002' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse(JSON.stringify(wireResponse(['student-002', 'student-001']))));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );
    const result = await provider.analyze(two);
    expect(result.students).toHaveLength(2);
  });

  it('重扫②专属：类型断言走私白名单外字段 → 拦截（终扫③无法感知）', async () => {
    const { provider, fetchMock } = makeProvider();
    const bad: AnalysisRequest = {
      ...request,
      students: [{ ...cleanStudent, 姓名: '张三' } as AnonymizedStudent],
    };
    await expect(provider.analyze(bad)).rejects.toBeInstanceOf(SecurityViolationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('超过 10 人自动分批：25 人 → 3 批，合并顺序与分块正确，schoolAnalysis 取首批', async () => {
    const students25 = Array.from({ length: 25 }, (_, i) => ({
      ...cleanStudent, anonymousId: `student-${String(i + 1).padStart(3, '0')}`,
    }));
    const request25: AnalysisRequest = { meta: request.meta, students: students25 };

    // 动态回显：解析请求中的学生 id，返回对应学生的合法响应
    const fetchMock = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const wire = JSON.parse(body.messages[1].content);
      const ids = wire.students.map((s: { id: string }) => s.id);
      return Promise.resolve(deepseekResponse(JSON.stringify(wireResponse(ids))));
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );

    const result = await provider.analyze(request25);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.students).toHaveLength(25);
    // 合并顺序保持原顺序
    expect(result.students.map((s) => s.studentId)).toEqual(students25.map((s) => s.anonymousId));

    // 分块正确：批 1 = 前 10，批 2 = 中 10，批 3 = 后 5
    const batchIds = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(JSON.parse((init as { body: string }).body).messages[1].content)
        .students.map((s: { id: string }) => s.id));
    expect(batchIds[0]).toEqual(students25.slice(0, 10).map((s) => s.anonymousId));
    expect(batchIds[1]).toEqual(students25.slice(10, 20).map((s) => s.anonymousId));
    expect(batchIds[2]).toEqual(students25.slice(20).map((s) => s.anonymousId));

    // 每批都携带全校总数（学校级归纳按全校视角）
    const batchTotals = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(JSON.parse((init as { body: string }).body).messages[1].content).school.totalStudents);
    expect(batchTotals).toEqual([25, 25, 25]);

    // schoolAnalysis 取首批
    expect(result.schoolAnalysis.studentCount).toBe(1);
  });

  it('多批 token 用量求和：15 人 → 2 批，usage 为各批之和', async () => {
    const students15 = Array.from({ length: 15 }, (_, i) => ({
      ...cleanStudent, anonymousId: `student-${String(i + 1).padStart(3, '0')}`,
    }));
    const request15: AnalysisRequest = { meta: request.meta, students: students15 };

    // 动态回显 + 每批固定 usage：批 1 = 1000/400，批 2 = 600/200
    let call = 0;
    const fetchMock = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      call += 1;
      const body = JSON.parse(init.body);
      const wire = JSON.parse(body.messages[1].content);
      const ids = wire.students.map((s: { id: string }) => s.id);
      const usage = call === 1
        ? { prompt_tokens: 1000, completion_tokens: 400, prompt_cache_hit_tokens: 250 }
        : { prompt_tokens: 600, completion_tokens: 200, prompt_cache_hit_tokens: 0 };
      return Promise.resolve(deepseekResponse(JSON.stringify(wireResponse(ids)), usage));
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );

    const result = await provider.analyze(request15);
    expect(result.students).toHaveLength(15);
    expect(result.usage).toEqual({
      apiCalls: 2, promptTokens: 1600, completionTokens: 600, cacheHitTokens: 250,
    });
  });

  it('分批中任一批安全扫描失败 → 整体失败（绝不部分发送后假装成功）', async () => {
    const students15 = Array.from({ length: 15 }, (_, i) => ({
      ...cleanStudent, anonymousId: `student-${String(i + 1).padStart(3, '0')}`,
    }));
    // 第 12 名学生携带伪造身份证（在第 2 批内）
    students15[11] = { ...students15[11], familySituation: '证件110101200001011234' };
    const request15: AnalysisRequest = { meta: request.meta, students: students15 };

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekAnalysisProvider(
      new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 30_000 }),
    );
    await expect(provider.analyze(request15)).rejects.toBeInstanceOf(SecurityViolationError);
    // 重扫②在分块前整体拦截，零网络
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

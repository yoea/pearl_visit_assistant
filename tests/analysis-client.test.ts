import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AnalysisClient, AnalysisClientError, CATEGORY_MESSAGES, DEFAULT_TIMEOUT_MS, DEEPSEEK_API_URL,
} from '../src/analysis/analysis-client';
import { createAnalysisPayload } from '../src/analysis/payload';
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

const payload = createAnalysisPayload(request, 'req-1');

const wireResponse = {
  version: '1.0',
  schoolAnalysis: {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [{
    studentId: 'student-001', summary: 's', familySituation: 'f',
    mainDifficultyFactors: [], informationToVerify: [],
    interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
  }],
};

/** DeepSeek 响应壳：choices[0].message.content 为模型文本；usage 可选（缺省 = 无 usage 字段） */
function okResponse(content: string, usage?: Record<string, unknown>): Response {
  const shell: Record<string, unknown> = { choices: [{ message: { content } }] };
  if (usage !== undefined) shell.usage = usage;
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify(shell),
  } as Response;
}

function errorResponse(status: number, body = 'server error details'): Response {
  return {
    ok: false, status, text: async () => body, ...{},
  } as Response;
}

const client = new AnalysisClient({ apiKey: 'sk-test-123', timeoutMs: DEFAULT_TIMEOUT_MS });

describe('AnalysisClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('2xx 合法响应 → 解析成功；端点/方法/头/消息体正确', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(JSON.stringify(wireResponse)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = await client.analyze(payload);
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DEEPSEEK_API_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test-123');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' }); // 推理模型：显式关闭思维链，防 max_tokens 被推理耗尽
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('不是资格审批器');
    expect(JSON.parse(body.messages[1].content).requestId).toBe('req-1');
  });

  it('401/403/400/404 → configuration 类别，文案不含服务端错误原文', async () => {
    for (const status of [400, 401, 403, 404]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(status, 'secret detail')));
      const err = await client.analyze(payload).catch((e: unknown) => e) as AnalysisClientError;
      expect(err).toBeInstanceOf(AnalysisClientError);
      expect((err as AnalysisClientError).category).toBe('configuration');
      expect(err.message).not.toContain('secret detail');
      expect(err.message).toBe(CATEGORY_MESSAGES.configuration);
    }
  });

  it('429 → rate-limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(429)));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('rate-limited');
  });

  it('500 → server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500)));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('server');
  });

  it('fetch reject（网络失败）→ network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('network');
  });

  it('AbortError → timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('timeout');
  });

  it('模型文本带 markdown 围栏 → 修复后成功', async () => {
    const content = '好的，以下是分析结果：\n```json\n' + JSON.stringify(wireResponse) + '\n```';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(content)));
    const { result } = await client.analyze(payload);
    expect(result.students[0].studentId).toBe('student-001');
  });

  it('usage 字段解析：prompt/completion/cache-hit 原样提取，apiCalls=1', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(
      JSON.stringify(wireResponse),
      { prompt_tokens: 1200, completion_tokens: 500, prompt_cache_hit_tokens: 300 },
    )));
    const { usage } = await client.analyze(payload);
    expect(usage).toEqual({ apiCalls: 1, promptTokens: 1200, completionTokens: 500, cacheHitTokens: 300 });
  });

  it('usage 缺失或字段异常 → 按 0 处理，主流程不受影响', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(JSON.stringify(wireResponse))));
    const first = await client.analyze(payload);
    expect(first.usage).toEqual({ apiCalls: 1, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 });

    // 字段类型错乱/负数/非有限值一律按 0，绝不抛错
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(
      JSON.stringify(wireResponse),
      { prompt_tokens: 'abc', completion_tokens: -5, prompt_cache_hit_tokens: Number.POSITIVE_INFINITY },
    )));
    const second = await client.analyze(payload);
    expect(second.usage).toEqual({ apiCalls: 1, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 });
    expect(second.result.students[0].studentId).toBe('student-001');
  });

  it('content 非 JSON 且修复失败 → 修正提示重试一次后仍失败 → format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('完全不是 JSON'));
    vi.stubGlobal('fetch', fetchMock);
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('format');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 第二次请求携带修正提示（不含学生数据）
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages[2].role).toBe('user');
    expect(second.messages[2].content).toContain('无法解析为 JSON');
  });

  it('上游壳非法 JSON / choices 缺失 / content 为空 → format（不重试，上游响应结构问题）', async () => {
    for (const shellText of [
      'not json at all',
      JSON.stringify({ choices: [] }),
      JSON.stringify({ choices: [{ message: { content: '' } }] }),
    ]) {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => shellText } as Response);
      vi.stubGlobal('fetch', fetchMock);
      const err = await client.analyze(payload).catch((e: unknown) => e);
      expect((err as AnalysisClientError).category).toBe('format');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('zod 校验失败（问题数不足）→ 修正提示重试后仍失败 → format', async () => {
    const bad = {
      ...wireResponse,
      students: [{ ...wireResponse.students[0], interviewQuestions: ['q1'] }],
    };
    const fetchMock = vi.fn().mockResolvedValue(okResponse(JSON.stringify(bad)));
    vi.stubGlobal('fetch', fetchMock);
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('format');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 第二次请求携带 zod 失败路径（无学生数据）
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages[2].content).toContain('students.0.interviewQuestions');
    expect(second.messages[2].content).not.toContain('母亲');
  });

  it('第一次结构校验失败（问题数不足）→ 第二次合法 → 返回结果（修复一次成功），usage 跨重试累计', async () => {
    const bad = {
      ...wireResponse,
      students: [{ ...wireResponse.students[0], interviewQuestions: ['q1'] }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(JSON.stringify(bad), { prompt_tokens: 100, completion_tokens: 50 }))
      .mockResolvedValueOnce(okResponse(JSON.stringify(wireResponse), { prompt_tokens: 200, completion_tokens: 80 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result, usage } = await client.analyze(payload);
    expect(result.students[0].studentId).toBe('student-001');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 修复重试是另一次真实 API 调用、另一次计费：两次调用均计入
    expect(usage).toEqual({ apiCalls: 2, promptTokens: 300, completionTokens: 130, cacheHitTokens: 0 });
  });

  it('超时阈值触发 AbortController（fake timers）', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const shortClient = new AnalysisClient({ apiKey: 'sk-test', timeoutMs: 1000 });
      const p = shortClient.analyze(payload).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      const err = await p;
      expect((err as AnalysisClientError).category).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('响应体 text() 读取失败 → network（不泄漏原始异常）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => { throw new Error('body stream broken'); },
    } as unknown as Response));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('network');
  });
});

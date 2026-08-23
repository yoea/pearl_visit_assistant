import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AnalysisClient, AnalysisClientError, CATEGORY_MESSAGES, DEFAULT_TIMEOUT_MS,
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

function okResponse(body: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: true, status: 200, text: async () => JSON.stringify(body), ...init,
  } as Response;
}

function errorResponse(status: number, body = 'server error details'): Response {
  return {
    ok: false, status, text: async () => body, ...{},
  } as Response;
}

const client = new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: DEFAULT_TIMEOUT_MS });

describe('AnalysisClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('2xx 合法响应 → 解析成功；方法/头/body 正确', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(wireResponse));
    vi.stubGlobal('fetch', fetchMock);
    const result = await client.analyze(payload);
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.org/api/analyze');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body).requestId).toBe('req-1');
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

  it('响应体非法 JSON → 修复后成功（markdown 围栏）', async () => {
    const body = '好的，以下是分析结果：\n```json\n' + JSON.stringify(wireResponse) + '\n```';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(null, { text: async () => body })));
    const result = await client.analyze(payload);
    expect(result.students[0].studentId).toBe('student-001');
  });

  it('响应体修复失败 → format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(null, { text: async () => '完全不是 JSON' })));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('format');
  });

  it('zod 校验失败（问题数不足）→ format', async () => {
    const bad = {
      ...wireResponse,
      students: [{ ...wireResponse.students[0], interviewQuestions: ['q1'] }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(bad)));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('format');
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
      const shortClient = new AnalysisClient({ apiUrl: 'https://example.org/api/analyze', timeoutMs: 1000 });
      const p = shortClient.analyze(payload).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      const err = await p;
      expect((err as AnalysisClientError).category).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('响应体 text() 读取失败 → network（不泄漏原始异常）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(null, {
      text: async () => { throw new Error('body stream broken'); },
    })));
    const err = await client.analyze(payload).catch((e: unknown) => e);
    expect((err as AnalysisClientError).category).toBe('network');
  });
});

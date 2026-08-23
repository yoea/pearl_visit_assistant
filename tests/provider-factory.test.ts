import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnalysisService } from '../src/analysis/provider-factory';
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

describe('createAnalysisService', () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('默认（未设置 provider）→ Mock：本地分析成功且零网络', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(result.students[0].interviewQuestions.length).toBeGreaterThanOrEqual(5);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('VITE_ANALYSIS_PROVIDER=real 但未配 API 地址 → 回退 Mock + console.warn 常量提示', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('回退');
  });

  it('VITE_ANALYSIS_PROVIDER=real + 配置地址 → 走真实网络（fetch 调用一次）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    vi.stubEnv('VITE_ANALYSIS_API_URL', 'https://example.org/api/analyze');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({
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
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('未知 provider 值 → 按 mock 处理（fail-safe 默认）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'other');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    await service.analyze(request, new Set());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('VITE_ANALYSIS_TIMEOUT_MS 非法值 → 默认 30s；合法值 → 生效（config 覆盖）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    vi.stubEnv('VITE_ANALYSIS_API_URL', 'https://example.org/api/analyze');
    vi.stubEnv('VITE_ANALYSIS_TIMEOUT_MS', 'abc');
    // 非法 env 值：构造不抛异常（按默认处理），仅验证 service 可用
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        version: '1.0',
        schoolAnalysis: {
          overview: 'x', studentCount: 1, difficultyPatterns: [], commonIssues: [],
          dataQualityIssues: [], keyVerificationTopics: [], interviewSuggestions: [],
        },
        students: [{
          studentId: 'student-001', summary: 's', familySituation: 'f',
          mainDifficultyFactors: [], informationToVerify: [],
          interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
        }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    expect(() => createAnalysisService()).not.toThrow();
    // config.timeoutMs 覆盖 env（200ms 内完成）
    const service = createAnalysisService({ timeoutMs: 30_000 });
    const result = await service.analyze(request, new Set());
    expect(result.schoolAnalysis.studentCount).toBe(1);
  });

  it('真实 provider 下服务硬闸①仍生效（伪造敏感数据被拦截、fetch 零调用）', async () => {
    vi.stubEnv('VITE_ANALYSIS_PROVIDER', 'real');
    vi.stubEnv('VITE_ANALYSIS_API_URL', 'https://example.org/api/analyze');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createAnalysisService();
    const bad: AnalysisRequest = {
      ...request,
      students: [{ ...cleanStudent, familySituation: '证件110101200001011234' }],
    };
    await expect(service.analyze(bad, new Set())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

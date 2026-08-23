import { describe, it, expect, vi } from 'vitest';
import { AnalysisService, SecurityViolationError } from '../src/analysis/analysis-service';
import type { AnalysisProvider, AnalysisResult } from '../src/analysis/provider';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const fakeStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: null, ethnicity: null, householdType: null,
  height: null, weight: null, healthStatus: null, difficultyLevel: null,
  enrollmentStatus: null, province: null, city: null, county: null, ancestralHome: null,
  distanceToSchoolKm: null, zhongkaoFullScore: null, zhongkaoScore: null,
  admissionRankBand: null, gradeSize: null, familySituation: null, visitMethod: null,
  visitSummary: null, awardsAndInterests: null, applicationReason: null,
  approvalComment: null, housingStatus: null, transportation: null, annualIncome: null,
  annualIncomeNote: null, perCapitaIncome: null, schoolChildrenCount: null,
  difficultyReason: null, elderlySupportStatus: null, elderlySupportNote: null,
  debtStatus: null, debtNote: null,
};

const fakeResult: AnalysisResult = {
  schoolAnalysis: {
    overview: '本校共 1 名候选学生。', studentCount: 1,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [],
};

const cleanRequest: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [fakeStudent],
};

describe('AnalysisService', () => {
  it('扫描失败时拒绝发送，provider 不被调用', async () => {
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const malicious: AnalysisRequest = {
      ...cleanRequest,
      students: [{ ...fakeStudent, familySituation: '证件110101200001011234' }],
    };
    await expect(service.analyze(malicious, new Set(['测试甲']))).rejects.toBeInstanceOf(
      SecurityViolationError,
    );
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('扫描通过时委托 provider 并返回结果', async () => {
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const result = await service.analyze(cleanRequest, new Set(['测试甲']));
    expect(provider.analyze).toHaveBeenCalledWith(cleanRequest);
    expect(result).toBe(fakeResult);
  });

  it('违规错误携带 findings', async () => {
    expect.assertions(2);
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const malicious: AnalysisRequest = {
      ...cleanRequest,
      students: [{ ...fakeStudent, familySituation: '证件110101200001011234' }],
    };
    try {
      await service.analyze(malicious, new Set());
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityViolationError);
      expect((e as SecurityViolationError).findings.length).toBeGreaterThan(0);
    }
  });

  it('provider 抛出的异常原样透传（不被安全层吞掉/包装）', async () => {
    const boom = new Error('provider 内部错误');
    const provider: AnalysisProvider = {
      name: 'stub',
      analyze: vi.fn(async () => { throw boom; }),
    };
    const service = new AnalysisService(provider);
    await expect(service.analyze(cleanRequest, new Set())).rejects.toBe(boom);
  });

  it('空黑名单时正常通过并委托 provider', async () => {
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const result = await service.analyze(cleanRequest, new Set());
    expect(provider.analyze).toHaveBeenCalledWith(cleanRequest);
    expect(result).toBe(fakeResult);
  });
});

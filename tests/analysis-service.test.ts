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
  school: {
    studentCount: 1, difficultyDistribution: {}, lowIncomeCount: 0, lowIncomeRatio: 0,
    majorIllnessCount: 0, singleParentOrWeakLaborCount: 0, highDebtCount: 0,
    rentalCount: 0, longDistanceCount: 0,
    completeness: { totalFields: 1, perStudent: [], averageMissing: 0 },
    focusStudentIds: [], suggestions: [],
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
});

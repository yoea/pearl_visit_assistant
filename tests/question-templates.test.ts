import { describe, it, expect } from 'vitest';
import {
  hasDebt, hasElderly, hasIllness, hasRental, QUESTION_TEMPLATES, selectQuestions,
} from '../src/analysis/question-templates';
import type { AnonymizedStudent } from '../src/types/student';

const s = (overrides: Partial<AnonymizedStudent> = {}): AnonymizedStudent => ({
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
  ...overrides,
});

describe('hasRental', () => {
  it('租房/租住 → true；自建房/空 → false', () => {
    expect(hasRental(s({ housingStatus: '租房（年租金/元）/10000以下' }))).toBe(true);
    expect(hasRental(s({ housingStatus: '租住' }))).toBe(true);
    expect(hasRental(s({ housingStatus: '自建房' }))).toBe(false);
    expect(hasRental(s())).toBe(false);
  });
});

describe('hasElderly', () => {
  it('非空人数 → true；否定/空 → false', () => {
    expect(hasElderly(s({ elderlySupportStatus: '4人' }))).toBe(true);
    expect(hasElderly(s({ elderlySupportStatus: '2人' }))).toBe(true);
    expect(hasElderly(s({ elderlySupportStatus: '无' }))).toBe(false);
    expect(hasElderly(s({ elderlySupportStatus: '0' }))).toBe(false);
    expect(hasElderly(s({ elderlySupportStatus: '没有' }))).toBe(false);
    expect(hasElderly(s({ elderlySupportStatus: '' }))).toBe(false);
    expect(hasElderly(s())).toBe(false);
  });
});

describe('hasDebt', () => {
  it('正向负债 → true', () => {
    expect(hasDebt(s({ debtStatus: '5万元' }))).toBe(true);
    expect(hasDebt(s({ debtStatus: '欠款2万' }))).toBe(true);
  });

  it('否定表述（无债务/无欠款/无负债/0/没有）与空 → false', () => {
    expect(hasDebt(s({ debtStatus: '无债务' }))).toBe(false);
    expect(hasDebt(s({ debtStatus: '无欠款' }))).toBe(false);
    expect(hasDebt(s({ debtStatus: '无负债' }))).toBe(false);
    expect(hasDebt(s({ debtStatus: '0' }))).toBe(false);
    expect(hasDebt(s({ debtStatus: '没有' }))).toBe(false);
    expect(hasDebt(s({ debtStatus: '' }))).toBe(false);
    expect(hasDebt(s())).toBe(false);
  });
});

describe('hasIllness', () => {
  it('正向疾病语境 → true（具体病种/患病/疾病/治疗史）', () => {
    expect(hasIllness(s({ familySituation: '母亲患心脏病' }))).toBe(true);
    expect(hasIllness(s({ difficultyReason: '父亲糖尿病需长期服药' }))).toBe(true);
    expect(hasIllness(s({ healthStatus: '曾住院手术' }))).toBe(true);
    expect(hasIllness(s({ visitSummary: '家中有人患病' }))).toBe(true);
  });

  it('否定前缀与中性表述 → false（无重大疾病/看病难/无）', () => {
    expect(hasIllness(s({ healthStatus: '无重大疾病' }))).toBe(false);
    expect(hasIllness(s({ familySituation: '看病难' }))).toBe(false);
    expect(hasIllness(s({ familySituation: '无' }))).toBe(false);
    expect(hasIllness(s({ familySituation: '健康' }))).toBe(false);
    expect(hasIllness(s())).toBe(false);
  });

  it('否定字段不吞并同学生其他正向字段', () => {
    expect(hasIllness(s({ healthStatus: '无重大疾病', familySituation: '母亲患病' }))).toBe(true);
  });
});

describe('selectQuestions 下限不变量', () => {
  it('无条件模板数 ≥ 5（slice(0,8) 的下限由模板库保证）', () => {
    expect(QUESTION_TEMPLATES.filter((t) => t.when === null).length).toBeGreaterThanOrEqual(5);
  });

  it('实际选取不少于 5 个', () => {
    expect(selectQuestions(s()).length).toBeGreaterThanOrEqual(5);
  });
});

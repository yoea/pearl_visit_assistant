import { describe, it, expect } from 'vitest';
import { parseAmount, checkNumericIssues } from '../src/anonymization/numeric-validation';
import type { AnonymizedStudent } from '../src/types/student';

const base: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: '174cm', weight: '56kg', healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '自建房', transportation: '无',
  annualIncome: 30000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

const field = (s: AnonymizedStudent, key: string) =>
  checkNumericIssues(s).filter((i) => i.key === key).map((i) => i.value);

describe('parseAmount（数字+单位/全角/千分位/万）', () => {
  it('常规与带单位值', () => {
    expect(parseAmount('105kg')).toBe(105);
    expect(parseAmount('174cm')).toBe(174);
    expect(parseAmount('8.00元')).toBe(8);
    expect(parseAmount('300000.00元')).toBe(300000);
    expect(parseAmount('1.65')).toBe(1.65);
    expect(parseAmount('10000.00')).toBe(10000);
  });
  it('「万」识别与千分位、全角', () => {
    expect(parseAmount('5万元')).toBe(50000);
    expect(parseAmount('0.8万')).toBe(8000);
    expect(parseAmount('1,000')).toBe(1000);
    expect(parseAmount('１０５kg')).toBe(105);
  });
  it('无法提取数字 → NaN（不误报）', () => {
    expect(Number.isNaN(parseAmount('无'))).toBe(true);
    expect(Number.isNaN(parseAmount(''))).toBe(true);
  });
});

describe('checkNumericIssues（脱敏/报告共用规则）', () => {
  it('正常学生零问题', () => {
    expect(checkNumericIssues(base)).toEqual([]);
  });

  it('体重 105kg（数字+单位）→ 标注', () => {
    const s = { ...base, weight: '105kg' };
    expect(field(s, 'weight')).toEqual(['105kg']);
  });

  it('身高 1.65（米）→ 标注；174cm 正常', () => {
    expect(field({ ...base, height: '1.65' }, 'height')).toEqual(['1.65']);
    expect(field(base, 'height')).toEqual([]);
  });

  it('年收入 1（漏万）→ 标注；5万元 → 不标注（万已换算）', () => {
    expect(field({ ...base, annualIncome: 1 }, 'annualIncome')).toEqual(['1']);
    expect(field({ ...base, annualIncome: 50000 }, 'annualIncome')).toEqual([]);
  });

  it('人均年收入 0.2 → 标注；人均高于年收入 → 标注（逻辑矛盾）', () => {
    expect(field({ ...base, perCapitaIncome: 0.2 }, 'perCapitaIncome')).toEqual(['0.2']);
    expect(field({ ...base, annualIncome: 2000, perCapitaIncome: 8000 }, 'perCapitaIncome')).toEqual(['8000']);
  });

  it('负债 8.00元 → 标注（负债不足百元不现实）', () => {
    expect(field({ ...base, debtStatus: '8.00元' }, 'debtStatus')).toEqual(['8.00元']);
    // 5万元负债正常
    expect(field(base, 'debtStatus')).toEqual([]);
  });

  it('中考成绩高于满分 → 标注；距离超 100 公里 → 标注', () => {
    expect(field({ ...base, zhongkaoScore: 900 }, 'zhongkaoScore')).toEqual(['900']);
    expect(field({ ...base, distanceToSchoolKm: 150 }, 'distanceToSchoolKm')).toEqual(['150']);
  });
});

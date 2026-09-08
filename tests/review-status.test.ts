import { describe, it, expect } from 'vitest';
import { countReviewStatuses, reviewStatusTone } from '../src/report/review-status';
import type { AnonymizedStudent } from '../src/types/student';

const base: AnonymizedStudent = {
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

describe('review-status（审核状态统计与色调）', () => {
  it('countReviewStatuses：计数、按人数降序、空值剔除', () => {
    const students = [
      { ...base, anonymousId: 's1', reviewStatus: '草稿' },
      { ...base, anonymousId: 's2', reviewStatus: '初审中' },
      { ...base, anonymousId: 's3', reviewStatus: '初审中' },
      { ...base, anonymousId: 's4', reviewStatus: '复审中' },
      { ...base, anonymousId: 's5', reviewStatus: null },
      { ...base, anonymousId: 's6', reviewStatus: '  ' },
    ];
    expect(countReviewStatuses(students)).toEqual([
      { status: '初审中', count: 2 },
      { status: '草稿', count: 1 },
      { status: '复审中', count: 1 },
    ]);
  });

  it('countReviewStatuses：无状态数据返回空数组', () => {
    expect(countReviewStatuses([{ ...base, reviewStatus: null }])).toEqual([]);
    expect(countReviewStatuses([])).toEqual([]);
  });

  it('reviewStatusTone：按关键字归类', () => {
    expect(reviewStatusTone('草稿')).toBe('slate');
    expect(reviewStatusTone('初审中')).toBe('blue');
    expect(reviewStatusTone('复审中')).toBe('amber');
    expect(reviewStatusTone('审核通过')).toBe('green');
    expect(reviewStatusTone('已通过')).toBe('green');
    expect(reviewStatusTone('未知词')).toBe('slate');
  });
});

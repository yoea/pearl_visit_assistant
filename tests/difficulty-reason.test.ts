import { describe, it, expect } from 'vitest';
import { splitReasons, countDifficultyReasons } from '../src/report/difficulty-reason';
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

describe('difficulty-reason（困难原因分布）', () => {
  it('splitReasons：按 / 、 等分隔符拆分，去重去空', () => {
    expect(splitReasons('单亲家庭（离异单亲）/主要抚养方常规')).toEqual(['单亲家庭（离异单亲）', '主要抚养方常规']);
    expect(splitReasons('母亲心脏病')).toEqual(['母亲心脏病']);
    expect(splitReasons('重大疾病、医疗开销大、 负债')).toEqual(['重大疾病', '医疗开销大', '负债']);
    expect(splitReasons('  ')).toEqual([]);
  });

  it('countDifficultyReasons：多选拆分计数、按人数降序、空值剔除', () => {
    const students = [
      { ...base, anonymousId: 's1', difficultyReason: '单亲/低保' },
      { ...base, anonymousId: 's2', difficultyReason: '单亲/主要抚养方患病' },
      { ...base, anonymousId: 's3', difficultyReason: '低保' },
      { ...base, anonymousId: 's4', difficultyReason: null },
    ];
    expect(countDifficultyReasons(students)).toEqual([
      { label: '单亲', count: 2 },
      { label: '低保', count: 2 },
      { label: '主要抚养方患病', count: 1 },
    ]);
  });

  it('超过 10 种原因合并为「其他」', () => {
    const students = Array.from({ length: 12 }, (_, i) => ({
      ...base, difficultyReason: `原因${i}`,
    }));
    const items = countDifficultyReasons(students);
    expect(items).toHaveLength(11); // 10 种 + 其他
    expect(items[10]).toEqual({ label: '其他', count: 2 });
  });
});

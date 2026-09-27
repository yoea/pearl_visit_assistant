import { describe, it, expect } from 'vitest';
import { countStudentImportance, IMPORTANCE_LABEL } from '../src/report/importance-distribution';
import type { DifficultyFactor, Importance, StudentAnalysis } from '../src/analysis/provider';

/** 构造一名学生（只需 mainDifficultyFactors，其余字段与统计无关） */
function student(id: string, importances: Importance[]): StudentAnalysis {
  return {
    studentId: id,
    summary: '',
    familySituation: '',
    mainDifficultyFactors: importances.map<DifficultyFactor>((importance, i) => ({
      factor: `因素${i}`, evidence: '材料原文', importance,
    })),
    informationToVerify: [],
    interviewQuestions: [],
    interviewNotes: [],
  };
}

const labels = (items: { label: string }[]) => items.map((i) => i.label);
const counts = (items: { count: number }[]) => items.map((i) => i.count);

describe('importance-distribution（困难因素重要性分布）', () => {
  it('回归：多因素学生不再被重复计数，各档之和 = 分析人数（47 人不得统计出 130 人）', () => {
    // 每人 2-3 个因素：旧实现按因素条数累加会得到远超 47 的合计
    const students = Array.from({ length: 47 }, (_, i) =>
      student(`s${i}`, i % 3 === 0 ? ['high', 'medium'] : i % 3 === 1 ? ['medium', 'low'] : ['high', 'medium', 'low']));

    const dist = countStudentImportance(students);

    const total = dist.items.reduce((a, i) => a + i.count, 0);
    expect(total).toBe(47);
    expect(dist.counted).toBe(47);
    expect(total).toBeLessThanOrEqual(students.length);
  });

  it('每名学生只归入其最高重要性那一档（high > medium > low）', () => {
    const dist = countStudentImportance([
      student('s1', ['low', 'high']),    // → 高
      student('s2', ['medium', 'low']),  // → 中
      student('s3', ['low']),            // → 低
      student('s4', ['low', 'medium', 'high']), // → 高
    ]);
    expect(counts(dist.items)).toEqual([2, 1, 1]);
    expect(labels(dist.items)).toEqual(['高', '中', '低']);
  });

  it('档位顺序固定为 高 → 中 → 低，且不出现 0 计数档位', () => {
    const dist = countStudentImportance([student('s1', ['low']), student('s2', ['low'])]);
    expect(dist.items).toEqual([{ key: 'low', label: '低', count: 2 }]);
    expect(dist.counted).toBe(2);
  });

  it('无困难因素的学生计入 withoutFactors，不进任何档位', () => {
    const dist = countStudentImportance([student('s1', ['high']), student('s2', []), student('s3', [])]);
    expect(dist.items).toEqual([{ key: 'high', label: '高', count: 1 }]);
    expect(dist.counted).toBe(1);
    expect(dist.withoutFactors).toBe(2);
    expect(dist.counted + dist.withoutFactors).toBe(3);
  });

  it('空输入返回空 items 且计数归零', () => {
    const dist = countStudentImportance([]);
    expect(dist.items).toEqual([]);
    expect(dist.counted).toBe(0);
    expect(dist.withoutFactors).toBe(0);
  });

  it('IMPORTANCE_LABEL 覆盖全部档位且为中文单字', () => {
    expect(IMPORTANCE_LABEL).toEqual({ high: '高', medium: '中', low: '低' });
  });
});

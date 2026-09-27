import { IMPORTANCE_VALUES, type DifficultyFactor, type Importance, type StudentAnalysis } from '../analysis/provider';

/**
 * 困难因素重要性分布：**按学生计数，不是按因素条数**。
 *
 * 每名学生可同时持有多个不同重要性的困难因素，若逐条累加，分母会变成「因素总数」——
 * 历史 bug：47 名学生统计出「高 60 / 中 50 / 低 20」共 130 人，远超分析人数。
 * 现按「每名学生只归入其最高重要性那一档」计数，保证各档之和恰好等于已归类学生数。
 *
 * 与 countDifficultyReasons（困难原因分布，多选拆分、允许一人多计）的口径差异是有意的：
 * 那里问的是「多少人提到过原因 X」，这里问的是「多少人属于档位 X」，必须是划分而非重叠。
 */

/** 档位中文标签 */
export const IMPORTANCE_LABEL: Record<Importance, string> = { high: '高', medium: '中', low: '低' };

/** 档位优先级（数值越小越严重）；完整覆盖 Importance，将来新增档位会编译报错而非静默漏算 */
const IMPORTANCE_RANK: Record<Importance, number> = { high: 0, medium: 1, low: 2 };

export interface ImportanceBucket {
  key: Importance;
  label: string;
  count: number;
}

export interface ImportanceDistribution {
  /** 仅保留 count > 0 的档位，顺序固定为 高 → 中 → 低 */
  items: ImportanceBucket[];
  /** 已归类学生数（= 各档之和） */
  counted: number;
  /** AI 未给出任何困难因素、故未计入任何档位的学生数 */
  withoutFactors: number;
}

export function countStudentImportance(students: readonly StudentAnalysis[]): ImportanceDistribution {
  const counts: Record<Importance, number> = { high: 0, medium: 0, low: 0 };
  let withoutFactors = 0;
  for (const s of students) {
    const top = highestImportance(s.mainDifficultyFactors);
    if (top === null) withoutFactors += 1;
    else counts[top] += 1;
  }
  const items = IMPORTANCE_VALUES
    .map((key) => ({ key, label: IMPORTANCE_LABEL[key], count: counts[key] }))
    .filter((i) => i.count > 0);
  return { items, counted: students.length - withoutFactors, withoutFactors };
}

/** 取一组困难因素中最严重的重要性；无因素返回 null */
function highestImportance(factors: readonly DifficultyFactor[]): Importance | null {
  let best: Importance | null = null;
  for (const f of factors) {
    if (best === null || IMPORTANCE_RANK[f.importance] < IMPORTANCE_RANK[best]) best = f.importance;
  }
  return best;
}

import type { AnonymizedStudent } from '../types/student';

/**
 * 「困难原因」字段统计：值为多选文本（如「单亲家庭（离异单亲）/主要抚养方常规」，
 * 以 / 、 等分隔）。按原因拆分计数，供学校整体情况的饼图展示（本地数据，绝不出站）。
 */

/** 拆分单个学生的困难原因（按常见分隔符；trim 去空；单个原因去重） */
export function splitReasons(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[/、,，;；\n]/)) {
    const t = part.trim();
    if (t !== '' && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export interface ReasonCount {
  label: string;
  count: number;
}

const MAX_SHOWN = 10;

/** 全校困难原因分布（多选拆分、按人数降序；超出上限合并为「其他」） */
export function countDifficultyReasons(studentsData: AnonymizedStudent[]): ReasonCount[] {
  const counts = new Map<string, number>();
  for (const s of studentsData) {
    const v = s.difficultyReason?.trim();
    if (!v) continue;
    for (const reason of splitReasons(v)) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  if (sorted.length <= MAX_SHOWN) return sorted;
  const head = sorted.slice(0, MAX_SHOWN);
  const rest = sorted.slice(MAX_SHOWN).reduce((a, i) => a + i.count, 0);
  return [...head, { label: '其他', count: rest }];
}

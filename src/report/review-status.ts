import type { AnonymizedStudent } from '../types/student';

/**
 * 审核状态展示工具（本地数据：上传表格「状态」列快照，绝不出站）。
 * 状态词常见形态：草稿 / 初审中 / 复审中 / 审核通过 / 已通过 / 已驳回 等，
 * 徽章颜色按关键字归类；未命中归「其他」灰。
 */

/** 徽章色调（Tailwind Badge tone 字符串） */
export function reviewStatusTone(status: string): string {
  const s = status.trim();
  if (s.includes('通过') || s.includes('完成') || s.includes('已审')) return 'green';
  if (s.includes('复审') || s.includes('驳回') || s.includes('退回')) return 'amber';
  if (s.includes('初审') || s.includes('审核中')) return 'blue';
  if (s.includes('草稿') || s.includes('待')) return 'slate';
  return 'slate';
}

export interface ReviewStatusCount {
  status: string;
  count: number;
}

/** 统计各审核状态人数（空/未知剔除）；按人数降序 */
export function countReviewStatuses(studentsData: AnonymizedStudent[]): ReviewStatusCount[] {
  const counts = new Map<string, number>();
  for (const s of studentsData) {
    const v = s.reviewStatus?.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status, 'zh-CN'));
}

/** 饼图配色（与上方 tone 归类一致的调色板，超出循环取色） */
export const REVIEW_STATUS_COLORS = [
  '#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f472b6', '#94a3b8', '#f87171', '#14b8a6',
];

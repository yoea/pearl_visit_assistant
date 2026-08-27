import { isKnownHeaderName } from '../anonymization/field-policies';

/**
 * 自动探测表头行下标（0-based），找不到时返回 -1。
 * 扫描前 12 行，每行打分 = 命中已知字段名数 × 10 + 非空单元格数；
 * 真实文件形态：①第 1 行合并标题、第 2 行表头（旧模板）；
 * ②系统导出文件：标题行 + 导出参数行 + 空行，表头可能在第 6 行左右（新适配）。
 * 表头行命中已知字段名数量远大于其他行（几十 vs 个位数），打分制天然稳定。
 * 若得分最高的行没有命中任何已知字段名（可能不是目标文件），返回 -1。
 */
export function detectHeaderRow(matrix: unknown[][]): number {
  const maxScan = Math.min(matrix.length, 12);
  let best = -1;
  let bestScore = 0;
  let bestKnown = 0;
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i];
    const known = row.filter((c) => typeof c === 'string' && isKnownHeaderName(String(c))).length;
    const nonEmpty = row.filter((c) => c != null && String(c).trim() !== '').length;
    const score = known * 10 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      best = i;
      bestKnown = known;
    }
  }
  return bestKnown > 0 ? best : -1;
}

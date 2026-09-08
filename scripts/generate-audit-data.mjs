/**
 * 从《2026年秋季审核安排-9月2日.xlsx》生成 src/data/audit-assignments.ts
 * 用法：node scripts/generate-audit-data.mjs （cwd 为项目根）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = fileURLToPath(new URL('..', import.meta.url));
const buf = readFileSync(`${root}examples/work/2026年秋季审核安排-9月2日.xlsx`);
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets['审核安排概况'];
const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

const rows = matrix.slice(1).filter((r) => r[2] != null && String(r[2]).trim() !== '');
const items = rows.map((r) => ({
  schoolName: String(r[2]).trim(),
  auditor: String(r[3] ?? '').trim(),
  visitor1: String(r[4] ?? '').trim(),
  visitor2: String(r[5] ?? '').trim(),
}));

const body = items.map((a) => JSON.stringify(a)).join(',\n  ');
const ts = `/**
 * 2026 秋季审核安排静态数据（审核人 / 走访人）。
 * 来源：《2026年秋季审核安排-9月2日.xlsx》审核安排概况 sheet（${items.length} 校，2026-09-08 快照）。
 * 审核安排相对固定；表更新后重跑 \`node scripts/generate-audit-data.mjs\` 重新生成本文件。
 */

export interface AuditAssignment {
  schoolName: string;
  /** 审核人 */
  auditor: string;
  /** 走访人 1 */
  visitor1: string;
  /** 走访人 2（可能为 '志愿者' / '志愿者：某某' / 空） */
  visitor2: string;
}

export const AUDIT_ASSIGNMENTS: AuditAssignment[] = [
  ${body},
];

/** 按学校名称查找审核安排：先精确匹配，再双向包含匹配（容忍省市前缀等名称差异） */
export function findAuditAssignment(schoolName: string): AuditAssignment | undefined {
  const name = schoolName.trim();
  return AUDIT_ASSIGNMENTS.find((a) => a.schoolName === name)
    ?? AUDIT_ASSIGNMENTS.find((a) => name.includes(a.schoolName) || a.schoolName.includes(name));
}
`;
writeFileSync(`${root}src/data/audit-assignments.ts`, ts);
console.log(`written ${items.length} items → src/data/audit-assignments.ts`);

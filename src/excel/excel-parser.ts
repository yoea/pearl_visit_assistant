import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { CellValue } from '../types/student';
import { normalizeHeader } from '../anonymization/field-policies';
import { detectHeaderRow } from './header-detector';

export interface ParsedExcel {
  sheetName: string;
  headers: string[]; // 表头行内容（含空串）
  rows: Record<string, CellValue>[]; // 每行：表头名 → 值（跳过全空行）
  schoolName: string | null;
  cohort: string | null;
  headerRowIndex: number; // 表头在 sheet 中的行号（1-based）
}

const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ParsedExcelSchema = z.object({
  sheetName: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.record(CellValueSchema)),
  schoolName: z.string().nullable(),
  cohort: z.string().nullable(),
  headerRowIndex: z.number(),
});

/** 读取 xlsx 并解析：自动探测表头行，按列字母对齐（SheetJS 原生行为），容忍空单元格 */
export function parseExcel(buffer: ArrayBuffer): ParsedExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false：值统一按显示文本输出，便于统一清洗
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as unknown[][];

  const headerIdx = detectHeaderRow(matrix);
  if (headerIdx < 0) {
    throw new Error('未能在前 5 行中找到表头行，请确认 Excel 结构');
  }
  const headers = (matrix[headerIdx] as unknown[]).map((h) => (h == null ? '' : String(h).trim()));

  const rows: Record<string, CellValue>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const rawRow = matrix[i];
    if (!rawRow || rawRow.every((c) => c == null || String(c).trim() === '')) continue;
    const rec: Record<string, CellValue> = {};
    headers.forEach((h, j) => {
      if (h !== '') rec[h] = (rawRow[j] ?? null) as CellValue;
    });
    rows.push(rec);
  }

  const pickFirstNonEmpty = (alias: string): string | null => {
    const col = headers.find((h) => normalizeHeader(h) === normalizeHeader(alias));
    if (!col) return null;
    const hit = rows.find((r) => r[col] != null && String(r[col]).trim() !== '');
    return hit ? String(hit[col]).trim() : null;
  };

  const result: ParsedExcel = {
    sheetName: wb.SheetNames[0],
    headers,
    rows,
    schoolName: pickFirstNonEmpty('学校名称'),
    cohort: pickFirstNonEmpty('期数'),
    headerRowIndex: headerIdx + 1,
  };
  ParsedExcelSchema.parse(result); // 结构校验
  return result;
}

import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { CellValue } from '../types/student';
import { normalizeHeader, isKnownHeaderName } from '../anonymization/field-policies';
import { detectHeaderRow } from './header-detector';

export interface ParsedExcel {
  sheetName: string;
  headers: string[]; // 表头行内容（含空串）
  rows: Record<string, CellValue>[]; // 每行：表头名 → 值（跳过全空行）
  rowNumbers: number[]; // 与 rows 对齐的 1-based 工作表行号
  schoolName: string | null;
  cohort: string | null;
  headerRowIndex: number; // 表头在 sheet 中的行号（1-based）
}

const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ParsedExcelSchema = z.object({
  sheetName: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.record(CellValueSchema)),
  rowNumbers: z.array(z.number()),
  schoolName: z.string().nullable(),
  cohort: z.string().nullable(),
  headerRowIndex: z.number(),
});

/**
 * 读取 xlsx 并解析：自动探测表头行，按列字母对齐（SheetJS 原生行为），容忍空单元格。
 * 只解析第一个工作表（基金会的学生数据模板为单表；多表文件的其余 sheet 被忽略，
 * 如需支持多表需在此显式扩展）。错误统一抛 Error（表头未找到/表头重复），
 * 由 UI 层（App.handleFile）捕获并包装为用户可读文案，本层不翻译。
 */
export function parseExcel(buffer: ArrayBuffer): ParsedExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false：值统一按显示文本输出，便于统一清洗。注意：输出值可能与原始存储值存在
  // 格式差异（如日期/数字按单元格显示格式渲染），这是有意的取舍——优先保证可清洗性。
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as unknown[][];

  const headerIdx = detectHeaderRow(matrix);
  if (headerIdx < 0) {
    throw new Error('未能在前 5 行中找到表头行，请确认 Excel 结构');
  }
  const headers = (matrix[headerIdx] as unknown[]).map((h) => (h == null ? '' : String(h).trim()));

  // 重复表头会导致按列名组织时静默覆盖丢数据，fail-closed 拒绝
  const seen = new Set<string>();
  for (const h of headers) {
    if (h === '') continue;
    const key = normalizeHeader(h);
    if (seen.has(key)) throw new Error(`表头重复: ${h}，请修正 Excel 后重试`);
    seen.add(key);
  }

  const rows: Record<string, CellValue>[] = [];
  const rowNumbers: number[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const rawRow = matrix[i];
    if (!rawRow || rawRow.every((c) => c == null || String(c).trim() === '')) continue;
    // 子表头/分组行：命中多个已知字段名（如导出文件的第二行表头，含省/市/区与尾部重复字段名）。
    // 真实数据行是值不是字段名，命中数必然为 0；≥2 即视为结构行跳过，不污染学生数据。
    const knownHits = rawRow.filter((c) => typeof c === 'string' && isKnownHeaderName(String(c))).length;
    if (knownHits >= 2) continue;
    const rec: Record<string, CellValue> = {};
    headers.forEach((h, j) => {
      if (h !== '') rec[h] = (rawRow[j] ?? null) as CellValue;
    });
    rows.push(rec);
    rowNumbers.push(i + 1); // i 是 matrix 下标（0-based），sheet 行号 = i + 1
  }

  /** 找列（loose 时按包含匹配，容忍「珍珠班编号（必填）」等变体）；取该列首个非空值 */
  const pickFirstNonEmpty = (alias: string, loose = false): string | null => {
    const col = headers.find((h) => {
      const n = normalizeHeader(h);
      return loose ? n.includes(normalizeHeader(alias)) : n === normalizeHeader(alias);
    });
    if (!col) return null;
    const hit = rows.find((r) => r[col] != null && String(r[col]).trim() !== '');
    if (!hit) return null;
    const v = String(hit[col]).trim();
    // 数字 0 / 字符串 '0' 视为未填写（raw:false 下空期数常渲染为 '0'，如「期数」列未填时）
    return v !== '' && v !== '0' ? v : null;
  };

  /** 届别提取：期数 → 珍珠班编号尾段（黑-03-26 → 26 → 2026级）→ 资助项目名称（2026级…） */
  const cohort = pickFirstNonEmpty('期数')
    ?? cohortFromClassNo(pickFirstNonEmpty('珍珠班编号', true))
    ?? cohortFromProjectName(pickFirstNonEmpty('资助项目名称', true));

  const result: ParsedExcel = {
    sheetName: wb.SheetNames[0],
    headers,
    rows,
    rowNumbers,
    schoolName: pickFirstNonEmpty('学校名称'),
    cohort,
    headerRowIndex: headerIdx + 1,
  };
  ParsedExcelSchema.parse(result); // 结构校验
  return result;
}

/** 珍珠班编号尾部两位 → 届别（「黑-03-26」→ 26 → 2026级）；非 20-29 段不猜测（避免把班号/学校编号误当届别） */
function cohortFromClassNo(v: string | null): string | null {
  if (!v) return null;
  const m = /(?:^|[- ])(\d{2})级?$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 20 && n <= 29 ? `20${m[1]}级` : null;
}

/** 资助项目名称中的「20XX级」→ 届别（「2026级捡回珍珠计划-高中段」→ 2026级） */
function cohortFromProjectName(v: string | null): string | null {
  if (!v) return null;
  const m = /(20\d{2})级/.exec(v);
  return m ? `${m[1]}级` : null;
}

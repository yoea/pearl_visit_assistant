import type { CellValue } from '../types/student';

/** 解析数字：容忍带单位字符串（"10000.00"、"0.00元"、"1.4"）；无法解析返回 null */
export function toNumber(v: CellValue): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^\d.-]/g, '');
  if (s === '' || s === '.' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 值 → 非空文本；空返回 null */
export function toText(v: CellValue): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

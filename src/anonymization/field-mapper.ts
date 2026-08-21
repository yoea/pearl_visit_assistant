import type { MappedColumn } from '../types/student';
import { classifyHeader, normalizeHeader } from './field-policies';

export interface FieldMappingResult {
  mappedColumns: MappedColumn[];
  /** 学校名称所在列（原始表头名），用于提取请求元数据；null = 无此列 */
  schoolNameColumn: string | null;
  /** 期数所在列（原始表头名），用于提取请求元数据；null = 无此列 */
  cohortColumn: string | null;
}

/** 表头列表 → 逐列策略映射。未知字段默认不发送。 */
export function mapFields(headers: string[]): FieldMappingResult {
  const mappedColumns: MappedColumn[] = headers.map((header) => ({
    header,
    normalizedHeader: normalizeHeader(header),
    ...classifyHeader(header),
  }));
  const findColumn = (alias: string) =>
    mappedColumns.find((c) => c.normalizedHeader === normalizeHeader(alias))?.header ?? null;
  return {
    mappedColumns,
    schoolNameColumn: findColumn('学校名称'),
    cohortColumn: findColumn('期数'),
  };
}

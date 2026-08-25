import type { RawStudentRecord } from '../types/student';
import { isStudentNameHeader, isThirdPartyNameHeader } from './field-policies';

/**
 * 原始数据受控仓库（安全红线核心）。
 * - 仅内存，无任何序列化/持久化方法；
 * - 页面刷新即失；
 * - snapshot() 仅供脱敏流水线使用，UI 组件不得调用；
 * - 对外只暴露计数与字段名（字段名不是学生数据）。
 */
export class RawStore {
  private records: RawStudentRecord[] = [];

  setRecords(records: RawStudentRecord[]): void {
    this.records = [...records];
  }

  get count(): number {
    return this.records.length;
  }

  get fieldNames(): string[] {
    return [...new Set(this.records.flatMap((r) => Object.keys(r.values)))];
  }

  /**
   * 仅供脱敏流水线（anonymize）使用，禁止传入 UI 组件。
   * 返回数组级副本：增删返回数组的元素不影响仓库；但各记录的 values 对象仍为共享引用，
   * 调用方不得就地修改 values（流水线只读消费）。
   */
  snapshot(): readonly RawStudentRecord[] {
    return [...this.records];
  }

  /** 提取姓名黑名单：学生姓名 + 家访教师姓名 + 审批人（供清洗与扫描共用） */
  collectNameBlacklist(): Set<string> {
    return collectNameBlacklist(this.records);
  }

  clear(): void {
    this.records = [];
  }
}

/** 应用级单例：一次会话一份原始数据 */
export const rawStore = new RawStore();

/** 从原始记录提取姓名黑名单。家访教师姓名可能含多个姓名，按标点/空白拆分。
 *  变体表头（如「学生姓名（必填）」「审批人（签字）」）经谓词识别同样纳入。 */
export function collectNameBlacklist(records: readonly RawStudentRecord[]): Set<string> {
  const names = new Set<string>();
  for (const r of records) {
    for (const key of Object.keys(r.values)) {
      if (!isStudentNameHeader(key) && !isThirdPartyNameHeader(key)) continue;
      const v = r.values[key];
      if (typeof v !== 'string' || v.trim() === '') continue;
      for (const part of v.split(/[,，、;；\s]+/)) {
        if (part.trim() !== '') names.add(part.trim());
      }
    }
  }
  return names;
}

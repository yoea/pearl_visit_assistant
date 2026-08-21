import { describe, it, expect } from 'vitest';
import { RawStore, collectNameBlacklist, rawStore } from '../src/anonymization/raw-store';
import {
  FORBIDDEN_IDENTITY_ALIASES,
  THIRD_PARTY_ALIASES,
  NAME_BEARING_ALIASES,
} from '../src/anonymization/field-policies';
import type { RawStudentRecord } from '../src/types/student';

const rec = (values: Record<string, string | number | null>): RawStudentRecord => ({
  sourceRow: 1,
  values,
});

describe('RawStore', () => {
  it('存取计数与字段名（字段名可展示，值不外泄）', () => {
    const store = new RawStore();
    store.setRecords([rec({ 性别: '女' }), rec({ 性别: '男', 家庭情况: 'x' })]);
    expect(store.count).toBe(2);
    expect(store.fieldNames.sort()).toEqual(['性别', '家庭情况'].sort());
  });

  it('clear 后清空', () => {
    const store = new RawStore();
    store.setRecords([rec({ 性别: '女' })]);
    store.clear();
    expect(store.count).toBe(0);
  });

  it('snapshot 返回副本，外部修改不影响仓库', () => {
    const store = new RawStore();
    store.setRecords([rec({ 性别: '女' })]);
    const snap = store.snapshot();
    (snap as RawStudentRecord[]).pop();
    expect(store.count).toBe(1);
  });

  it('模块级单例存在', () => {
    expect(rawStore).toBeInstanceOf(RawStore);
  });
});

describe('collectNameBlacklist', () => {
  it('收集学生姓名、家访教师姓名、审批人（教师姓名按逗号拆分）', () => {
    const names = collectNameBlacklist([
      rec({ 珍珠生姓名: '测试学生甲' }),
      rec({ 家访教师姓名: '刘玉坤，刘慧敏、张泽成' }),
      rec({ 审批人: '张磊' }),
    ]);
    expect(names).toEqual(new Set(['测试学生甲', '刘玉坤', '刘慧敏', '张泽成', '张磊']));
  });

  it('忽略空值', () => {
    const names = collectNameBlacklist([rec({ 珍珠生姓名: '' }), rec({})]);
    expect(names.size).toBe(0);
  });

  it('按姓名别名变体收集（学生姓名/结对捐方）', () => {
    const names = collectNameBlacklist([
      rec({ 学生姓名: '测试乙' }),
      rec({ 结对捐方: '王明' }),
    ]);
    expect(names).toEqual(new Set(['测试乙', '王明']));
  });

  it('姓名别名与策略表一致（不变量）', () => {
    const union = [...FORBIDDEN_IDENTITY_ALIASES, ...THIRD_PARTY_ALIASES];
    for (const alias of NAME_BEARING_ALIASES) {
      expect(union).toContain(alias);
    }
  });
});

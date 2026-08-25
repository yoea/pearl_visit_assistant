import { describe, it, expect } from 'vitest';
import {
  classifyHeader,
  FIELD_POLICIES,
  FORBIDDEN_IDENTITY_ALIASES,
  INTERNAL_ALIASES,
  isKnownHeaderName,
  isStudentNameHeader,
  normalizeHeader,
  THIRD_PARTY_ALIASES,
} from '../src/anonymization/field-policies';
import { mapFields } from '../src/anonymization/field-mapper';

describe('normalizeHeader', () => {
  it('去空格并转小写（兼容真实文件中的小写 qq）', () => {
    expect(normalizeHeader('  QQ ')).toBe('qq');
    expect(normalizeHeader('家庭情况')).toBe('家庭情况');
  });

  it('压缩内部空格', () => {
    expect(normalizeHeader('珍珠生 姓名')).toBe('珍珠生姓名');
  });
});

describe('classifyHeader', () => {
  it('直接身份信息 → drop/identity', () => {
    expect(classifyHeader('身份证号')).toEqual({ canonicalKey: null, action: { action: 'drop', reason: 'identity' } });
    expect(classifyHeader('qq').action).toEqual({ action: 'drop', reason: 'identity' });
    expect(classifyHeader('电话').action).toEqual({ action: 'drop', reason: 'identity' });
  });

  it('第三方姓名 → drop/third-party', () => {
    expect(classifyHeader('家访教师姓名').action).toEqual({ action: 'drop', reason: 'third-party' });
    expect(classifyHeader('审批人').action).toEqual({ action: 'drop', reason: 'third-party' });
    expect(classifyHeader('结对捐方').action).toEqual({ action: 'drop', reason: 'third-party' });
  });

  it('内部字段 → drop/internal', () => {
    expect(classifyHeader('序号').action).toEqual({ action: 'drop', reason: 'internal' });
    expect(classifyHeader('学校名称').action).toEqual({ action: 'drop', reason: 'internal' });
  });

  it('保留字段 → keep', () => {
    expect(classifyHeader('性别')).toMatchObject({ canonicalKey: 'gender', action: { action: 'keep' } });
    expect(classifyHeader('住址省')).toMatchObject({ canonicalKey: 'province', action: { action: 'keep' } });
  });

  it('排名 → generalize/rank-band', () => {
    expect(classifyHeader('录取高中全校排名')).toMatchObject({
      canonicalKey: 'admissionRank',
      action: { action: 'generalize', kind: 'rank-band' },
    });
  });

  it('叙事字段 → scrub', () => {
    expect(classifyHeader('家庭情况')).toMatchObject({ canonicalKey: 'familySituation', action: { action: 'scrub' } });
    expect(classifyHeader('审批意见')).toMatchObject({ canonicalKey: 'approvalComment', action: { action: 'scrub' } });
  });

  it('未知字段 → 默认不发送', () => {
    expect(classifyHeader('未来新增字段XYZ')).toEqual({
      canonicalKey: null,
      action: { action: 'drop', reason: 'unknown' },
    });
  });

  it('姓名列变体表头（必填/星号/括号备注）→ drop/identity', () => {
    for (const header of ['学生姓名（必填）', '珍珠生姓名*', '姓名 (Name)']) {
      expect(classifyHeader(header)).toEqual({
        canonicalKey: null,
        action: { action: 'drop', reason: 'identity' },
      });
    }
  });

  it('第三方姓名变体表头 → drop/third-party（优先于学生姓名判定）', () => {
    expect(classifyHeader('家访教师姓名（必填）')).toEqual({
      canonicalKey: null,
      action: { action: 'drop', reason: 'third-party' },
    });
    expect(classifyHeader('审批人（签字）')).toEqual({
      canonicalKey: null,
      action: { action: 'drop', reason: 'third-party' },
    });
  });

  it('姓名拼音安全删除，但谓词判定非学生姓名列（防拼音串污染黑名单）', () => {
    expect(classifyHeader('姓名拼音').action).toEqual({ action: 'drop', reason: 'identity' });
    expect(isStudentNameHeader('姓名拼音')).toBe(false);
    expect(isStudentNameHeader('家长姓名')).toBe(true);
  });
});

describe('mapFields', () => {
  it('产出逐列映射并识别学校名称列', () => {
    const { mappedColumns, schoolNameColumn } = mapFields(['性别', '未知列', '学校名称']);
    expect(mappedColumns).toHaveLength(3);
    expect(mappedColumns[0].canonicalKey).toBe('gender');
    expect(mappedColumns[1].action).toEqual({ action: 'drop', reason: 'unknown' });
    expect(schoolNameColumn).toBe('学校名称');
  });

  it('识别期数列（无期数列返回 null）', () => {
    expect(mapFields(['期数']).cohortColumn).toBe('期数');
    expect(mapFields(['性别', '未知列', '学校名称']).cohortColumn).toBeNull();
  });
});

describe('isKnownHeaderName', () => {
  it('已知字段名判定（供表头行检测打分）', () => {
    expect(isKnownHeaderName('性别')).toBe(true);
    expect(isKnownHeaderName('未来新增字段XYZ')).toBe(false);
    expect(isKnownHeaderName('qq')).toBe(true); // 身份别名是「已知」分类，不属于未知
  });
});

describe('字段策略表不变量（安全红线）', () => {
  const policyAliases = Object.values(FIELD_POLICIES).flatMap((entry) => entry.aliases);
  const tables = [policyAliases, FORBIDDEN_IDENTITY_ALIASES, THIRD_PARTY_ALIASES, INTERNAL_ALIASES];

  it('四个表两两交集为空：删除表优先才与原顺序等价，且不会误保留身份别名', () => {
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        for (const a of tables[i]) expect(tables[j]).not.toContain(a);
      }
    }
  });

  it('各表内部无重复别名', () => {
    for (const table of tables) expect(new Set(table).size).toBe(table.length);
  });
});

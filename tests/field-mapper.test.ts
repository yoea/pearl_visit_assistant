import { describe, it, expect } from 'vitest';
import { classifyHeader, normalizeHeader } from '../src/anonymization/field-policies';
import { mapFields } from '../src/anonymization/field-mapper';

describe('normalizeHeader', () => {
  it('去空格并转小写（兼容真实文件中的小写 qq）', () => {
    expect(normalizeHeader('  QQ ')).toBe('qq');
    expect(normalizeHeader('家庭情况')).toBe('家庭情况');
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
});

describe('mapFields', () => {
  it('产出逐列映射并识别学校名称列', () => {
    const { mappedColumns, schoolNameColumn } = mapFields(['性别', '未知列', '学校名称']);
    expect(mappedColumns).toHaveLength(3);
    expect(mappedColumns[0].canonicalKey).toBe('gender');
    expect(mappedColumns[1].action).toEqual({ action: 'drop', reason: 'unknown' });
    expect(schoolNameColumn).toBe('学校名称');
  });
});

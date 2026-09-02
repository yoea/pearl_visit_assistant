import { describe, it, expect } from 'vitest';
import { sanitize, parseRecords, summarize } from '../server/usage-core.mjs';

const validBody = {
  tool: 'pearl-visit-assistant',
  version: 'v1.1.0',
  clientId: 'abc-123',
  event: 'analysis_succeeded',
  occurredAt: '2026-08-27T10:00:00.000Z',
  payload: {
    students: 12,
    usage: { apiCalls: 2, promptTokens: 300, completionTokens: 150, cacheHitTokens: 50 },
    cumulative: { analyses: 3, promptTokens: 900, completionTokens: 400, totalTokens: 1300 },
  },
};

describe('usage-core（白名单清洗 + 汇总）', () => {
  it('合法上报：保留白名单字段，丢弃未知字段（防脏数据/防误存学生数据）', () => {
    const dirty = {
      ...validBody,
      学生姓名: '张三',
      familySituation: '敏感信息',
      secret: 'x',
      payload: { ...validBody.payload, name: '李四', address: '某地' },
    };
    const clean = sanitize(dirty);
    expect(clean).toEqual(validBody);
    expect(JSON.stringify(clean)).not.toContain('张三');
    expect(JSON.stringify(clean)).not.toContain('familySituation');
    expect(JSON.stringify(clean)).not.toContain('name');
  });

  it('非法事件 / 缺关键字段 → null（不落盘）', () => {
    expect(sanitize({ ...validBody, event: 'delete_all' })).toBeNull();
    expect(sanitize({ ...validBody, clientId: undefined })).toBeNull();
    expect(sanitize({ ...validBody, tool: 123 })).toBeNull();
    expect(sanitize(null)).toBeNull();
    expect(sanitize('text')).toBeNull();
  });

  it('数字字段：负数/非数字被丢弃', () => {
    const clean = sanitize({
      ...validBody,
      payload: { students: -5, usage: { promptTokens: 'abc', completionTokens: -1, apiCalls: 1 } },
    });
    expect(clean).not.toBeNull();
    const payload = (clean as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.students).toBeUndefined();
    expect(payload.usage).toEqual({ apiCalls: 1 });
  });

  it('parseRecords：损坏行跳过，合法行保留', () => {
    const text = `${JSON.stringify(validBody)}\nbroken line {{{\n${JSON.stringify({ ...validBody, event: 'open' })}\n`;
    const records = parseRecords(text);
    expect(records).toHaveLength(2);
    expect(records[0].event).toBe('analysis_succeeded');
    expect(records[1].event).toBe('open');
  });

  it('summarize：打开/成功/失败计数、token 汇总、去重用户、每日趋势', () => {
    const records = parseRecords([
      JSON.stringify({ ...validBody, clientId: 'a', occurredAt: '2026-08-27T10:00:00Z', event: 'open' }),
      JSON.stringify({ ...validBody, clientId: 'a', occurredAt: '2026-08-27T11:00:00Z' }),
      JSON.stringify({ ...validBody, clientId: 'b', occurredAt: '2026-08-28T09:00:00Z' }),
      JSON.stringify({ ...validBody, clientId: 'a', occurredAt: '2026-08-28T10:00:00Z', event: 'analysis_failed' }),
    ].join('\n'));
    const s = summarize(records);
    expect(s.opens).toBe(1);
    expect(s.succeeded).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.uniqueClients).toBe(2);
    expect(s.promptTokens).toBe(600); // 2 次成功 × 300
    expect(s.completionTokens).toBe(300);
    expect(s.totalTokens).toBe(900);
    expect(s.totalStudents).toBe(24);
    expect(s.trend).toEqual([
      { date: '2026-08-27', count: 2 },
      { date: '2026-08-28', count: 2 },
    ]);
  });

  it('summarize：下载（MD/HTML 分开）与搜索计数', () => {
    const records = parseRecords([
      JSON.stringify({ ...validBody, clientId: 'a', event: 'report_downloaded', payload: { format: 'markdown' } }),
      JSON.stringify({ ...validBody, clientId: 'a', event: 'report_downloaded', payload: { format: 'markdown' } }),
      JSON.stringify({ ...validBody, clientId: 'a', event: 'report_downloaded', payload: { format: 'html' } }),
      JSON.stringify({ ...validBody, clientId: 'b', event: 'student_search' }),
      JSON.stringify({ ...validBody, clientId: 'b', event: 'student_search' }),
      JSON.stringify({ ...validBody, clientId: 'b', event: 'student_search' }),
    ].join('\n'));
    const s = summarize(records);
    expect(s.mdDownloads).toBe(2);
    expect(s.htmlDownloads).toBe(1);
    expect(s.searches).toBe(3);
  });

  it('sanitize：format 白名单（非法格式丢弃）', () => {
    const ok = sanitize({ ...validBody, event: 'report_downloaded', payload: { format: 'pdf' } });
    expect(ok).not.toBeNull();
    expect((ok as Record<string, unknown>).payload).toEqual({});
    const ok2 = sanitize({ ...validBody, event: 'report_downloaded', payload: { format: 'html' } });
    expect((ok2 as Record<string, unknown>).payload).toEqual({ format: 'html' });
    // student_search 不携带 payload 字段
    const s = sanitize({ ...validBody, event: 'student_search', payload: { query: '张三' } });
    expect(JSON.stringify(s)).not.toContain('张三');
    expect((s as Record<string, unknown>).payload).toEqual({});
  });

  it('summarize：空记录不崩溃', () => {
    const s = summarize([]);
    expect(s.opens).toBe(0);
    expect(s.succeeded).toBe(0);
    expect(s.totalTokens).toBe(0);
    expect(s.uniqueClients).toBe(0);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import {
  sanitize, appendUsage, loadRecords, summarize, setDbPath, closeDb,
} from '../server/usage-core.mjs';

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

let tmpDb = '';

beforeAll(() => {
  tmpDb = join(tmpdir(), `usage-test-${Date.now()}.db`);
  setDbPath(tmpDb);
});

afterAll(() => {
  closeDb();
  if (existsSync(tmpDb)) rmSync(tmpDb, { force: true });
});

describe('usage-core（SQLite 白名单存储 + 汇总）', () => {
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

  it('sanitize：format 白名单（非法格式丢弃）', () => {
    const ok = sanitize({ ...validBody, event: 'report_downloaded', payload: { format: 'docx' } });
    expect(ok).not.toBeNull();
    expect((ok as Record<string, unknown>).payload).toEqual({});
    const ok2 = sanitize({ ...validBody, event: 'report_downloaded', payload: { format: 'html' } });
    expect((ok2 as Record<string, unknown>).payload).toEqual({ format: 'html' });
    const ok3 = sanitize({ ...validBody, event: 'report_downloaded', payload: { format: 'pdf' } });
    expect((ok3 as Record<string, unknown>).payload).toEqual({ format: 'pdf' });
    // student_search 不携带 payload 字段
    const s = sanitize({ ...validBody, event: 'student_search', payload: { query: '张三' } });
    expect(JSON.stringify(s)).not.toContain('张三');
    expect((s as Record<string, unknown>).payload).toEqual({});
  });

  it('appendUsage → loadRecords 往返（SQLite 存储，字段还原）', () => {
    expect(appendUsage(sanitize(validBody)!)).toBe(true);
    expect(appendUsage(sanitize({ ...validBody, event: 'open', payload: {}, occurredAt: '2026-08-27T09:00:00.000Z' })!)).toBe(true);
    const records = loadRecords() as Array<{
      event: string; clientId: string;
      payload: { usage?: Record<string, number>; cumulative?: Record<string, number> };
    }>;
    expect(records).toHaveLength(2);
    expect(records[0].event).toBe('analysis_succeeded');
    expect(records[0].clientId).toBe('abc-123');
    expect(records[0].payload.usage).toEqual({ apiCalls: 2, promptTokens: 300, completionTokens: 150, cacheHitTokens: 50 });
    expect(records[0].payload.cumulative?.totalTokens).toBe(1300);
    expect(records[1].event).toBe('open');
    expect(records[1].payload).toEqual({});
  });

  it('sanitize 返回 null 时 appendUsage 拒绝写入', () => {
    expect(appendUsage(null as unknown as Record<string, unknown>)).toBe(false);
  });

  it('summarize：上传/打开/成功/失败计数、token 汇总、去重用户、每日趋势', () => {
    const records = loadRecords(); // 含 1 open + 1 succeeded（students 12，prompt 300）
    const all = [
      ...records,
      { tool: 'pearl-visit-assistant', version: 'v1.1.0', clientId: 'b', event: 'file_uploaded', occurredAt: '2026-08-27T10:30:00Z', payload: { students: 80 } },
      { tool: 'x', version: 'v1', clientId: 'b', event: 'analysis_succeeded', occurredAt: '2026-08-28T09:00:00Z', payload: { students: 6, usage: { promptTokens: 300, completionTokens: 150 } } },
      { tool: 'x', version: 'v1', clientId: 'a', event: 'analysis_failed', occurredAt: '2026-08-28T10:00:00Z', payload: { errorCategory: 'timeout' } },
      { tool: 'x', version: 'v1', clientId: 'c', event: 'report_downloaded', occurredAt: '2026-08-28T11:00:00Z', payload: { format: 'markdown' } },
      { tool: 'x', version: 'v1', clientId: 'c', event: 'report_downloaded', occurredAt: '2026-08-28T11:01:00Z', payload: { format: 'html' } },
      { tool: 'x', version: 'v1', clientId: 'd', event: 'student_search', occurredAt: '2026-08-29T09:00:00Z', payload: {} },
    ];
    const s = summarize(all);
    expect(s.opens).toBe(1);
    expect(s.uploads).toBe(1);
    expect(s.succeeded).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.uniqueClients).toBe(5); // abc-123(库内) + b + a + c + d
    expect(s.mdDownloads).toBe(1);
    expect(s.htmlDownloads).toBe(1);
    expect(s.searches).toBe(1);
    expect(s.promptTokens).toBe(600); // 300 × 2 次成功
    expect(s.completionTokens).toBe(300);
    expect(s.totalTokens).toBe(900);
    expect(s.totalStudents).toBe(18); // 12 + 6
    expect(s.trend).toEqual([
      { date: '2026-08-27', count: 3 },
      { date: '2026-08-28', count: 4 },
      { date: '2026-08-29', count: 1 },
    ]);
  });

  it('summarize：空记录不崩溃', () => {
    const s = summarize([]);
    expect(s.opens).toBe(0);
    expect(s.uploads).toBe(0);
    expect(s.succeeded).toBe(0);
    expect(s.totalTokens).toBe(0);
    expect(s.uniqueClients).toBe(0);
  });
});

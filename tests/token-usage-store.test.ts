import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTokenUsage, recordTokenUsage } from '../src/stats/token-usage-store';
import type { TokenUsage } from '../src/analysis/provider';

const STORAGE_KEY = 'pearl-visit:token-usage:v1';

/** 最小 localStorage 假实现（Map 支撑，行为与浏览器一致） */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  (globalThis as Record<string, unknown>).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

const usageA: TokenUsage = { apiCalls: 2, promptTokens: 300, completionTokens: 150, cacheHitTokens: 100 };
const usageB: TokenUsage = { apiCalls: 1, promptTokens: 100, completionTokens: 50, cacheHitTokens: 0 };

describe('token-usage-store（localStorage 仅存 token 计数数字）', () => {
  it('初始为空态：全 0、无日期、不写存储', () => {
    expect(getTokenUsage()).toEqual({
      analyses: 0, apiCalls: 0, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, cacheHitTokens: 0, firstRecordedAt: null, lastRecordedAt: null,
    });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('两次 record 累加并写回；原始 JSON 只含白名单键（数字 + 两个时间戳）', () => {
    recordTokenUsage(usageA);
    const second = recordTokenUsage(usageB);

    expect(second).toEqual(getTokenUsage());
    const s = getTokenUsage();
    expect(s.analyses).toBe(2);
    expect(s.apiCalls).toBe(3);
    expect(s.promptTokens).toBe(400);
    expect(s.completionTokens).toBe(200);
    expect(s.totalTokens).toBe(600); // prompt + completion
    expect(s.cacheHitTokens).toBe(100);
    expect(s.firstRecordedAt).not.toBeNull();
    expect(s.lastRecordedAt).not.toBeNull();

    // 持久化的原始 JSON 绝不包含白名单之外的键
    const raw = JSON.parse(storage.getItem(STORAGE_KEY)!) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual([
      'analyses', 'apiCalls', 'cacheHitTokens', 'completionTokens',
      'firstRecordedAt', 'lastRecordedAt', 'promptTokens', 'totalTokens',
    ]);
    // 值均为有限非负数或 ISO 字符串（绝不含学生数据等任意文本字段）
    for (const [k, v] of Object.entries(raw)) {
      if (k.endsWith('At')) expect(typeof v).toBe('string');
      else expect(typeof v === 'number' && Number.isFinite(v)).toBe(true);
    }
  });

  it('存储损坏（非 JSON / 非对象）→ 按空态读取，record 后覆盖恢复', () => {
    storage.setItem(STORAGE_KEY, 'not json {{{');
    expect(getTokenUsage().analyses).toBe(0);
    expect(recordTokenUsage(usageB).analyses).toBe(1);
    expect(getTokenUsage().promptTokens).toBe(100);

    storage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(getTokenUsage().analyses).toBe(0);
  });

  it('字段被篡改（非数字/负数/NaN）→ 异常字段按 0，合法字段保留', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      analyses: 'x', apiCalls: 3, promptTokens: -5, completionTokens: 1e9,
      totalTokens: 'many', cacheHitTokens: 2, firstRecordedAt: 123, lastRecordedAt: '2026-08-21T10:00:00.000Z',
    }));
    const s = getTokenUsage();
    expect(s.analyses).toBe(0);
    expect(s.apiCalls).toBe(3);
    expect(s.promptTokens).toBe(0);
    expect(s.completionTokens).toBe(1e9);
    expect(s.totalTokens).toBe(0);
    expect(s.cacheHitTokens).toBe(2);
    expect(s.firstRecordedAt).toBeNull();
    expect(s.lastRecordedAt).toBe('2026-08-21T10:00:00.000Z');
  });

  it('localStorage 不可用（读写抛错）→ 不抛错，record 仍返回内存累加结果', () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(getTokenUsage().analyses).toBe(0);
    const s = recordTokenUsage(usageA);
    expect(s.analyses).toBe(1);
    expect(s.promptTokens).toBe(300);
  });
});

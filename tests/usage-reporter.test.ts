import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reportOpen, reportAnalysisSucceeded, reportAnalysisFailed, type UsageReport,
} from '../src/stats/usage-reporter';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

let storage: ReturnType<typeof makeStorage>;
let beaconMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  storage = makeStorage();
  (globalThis as Record<string, unknown>).localStorage = storage;
  beaconMock = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beaconMock, configurable: true });
  vi.unstubAllEnvs();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  vi.restoreAllMocks();
});

const usage = { apiCalls: 2, promptTokens: 300, completionTokens: 150, cacheHitTokens: 50 };
const cumulative = {
  analyses: 3, apiCalls: 5, promptTokens: 900, completionTokens: 400,
  totalTokens: 1300, cacheHitTokens: 150, firstRecordedAt: 'x', lastRecordedAt: 'y',
};

/** 解析 beacon 发送的 body */
async function beaconBody(): Promise<UsageReport> {
  const arg = beaconMock.mock.calls[0][1] as Blob;
  const text = await arg.text();
  return JSON.parse(text) as UsageReport;
}

describe('usage-reporter（白名单计数上报）', () => {
  it('未配置 VITE_USAGE_REPORT_URL → 完全不发送（零网络）', () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', ''); // 显式置空（覆盖 .env 中的实际配置）
    reportOpen('v1.1.0');
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('open 事件：payload 只含白名单字段（tool/version/clientId/event/时间戳）', async () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', 'https://stats.example.com/usage');
    reportOpen('v1.1.0');
    expect(beaconMock).toHaveBeenCalledTimes(1);
    const body = await beaconBody();
    expect(body.tool).toBe('pearl-visit-assistant');
    expect(body.version).toBe('v1.1.0');
    expect(body.event).toBe('open');
    expect(body.clientId).toMatch(/^[0-9a-f-]{20,}$/);
    expect(Number.isNaN(Date.parse(body.occurredAt))).toBe(false);
    expect(Object.keys(body.payload)).toEqual([]); // open 无附加数据
  });

  it('analysis_succeeded：携带学生数 + token 用量 + 累计；不含学生数据', async () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', 'https://stats.example.com/usage');
    reportAnalysisSucceeded('v1.1.0', 12, usage, cumulative);
    const body = await beaconBody();
    expect(body.event).toBe('analysis_succeeded');
    expect(body.payload.students).toBe(12);
    expect(body.payload.usage).toEqual({ apiCalls: 2, promptTokens: 300, completionTokens: 150, cacheHitTokens: 50 });
    expect(body.payload.cumulative).toEqual({ analyses: 3, promptTokens: 900, completionTokens: 400, totalTokens: 1300 });
    // 白名单检查：序列化后不得出现任何疑似学生数据字段
    const json = JSON.stringify(body);
    expect(json).not.toContain('name');
    expect(json).not.toContain('学生');
    expect(json).not.toContain('school');
  });

  it('mock 分析（无 usage/累计）→ payload 只有 students', async () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', 'https://stats.example.com/usage');
    reportAnalysisSucceeded('v1.1.0', 5, undefined, undefined);
    const body = await beaconBody();
    expect(body.payload).toEqual({ students: 5 });
  });

  it('analysis_failed：只带错误类别枚举名', async () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', 'https://stats.example.com/usage');
    reportAnalysisFailed('v1.1.0', 'timeout');
    const body = await beaconBody();
    expect(body.event).toBe('analysis_failed');
    expect(body.payload).toEqual({ errorCategory: 'timeout' });
  });

  it('clientId 稳定：同一浏览器多次上报使用同一 ID', async () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', 'https://stats.example.com/usage');
    reportOpen('v1.1.0');
    reportAnalysisSucceeded('v1.1.0', 1, undefined, undefined);
    const id1 = (await beaconBody()).clientId;
    const id2 = (await beaconBody()).clientId;
    expect(id1).toBe(id2);
  });

  it('sendBeacon 不可用时回退 fetch；上报异常静默不抛错', () => {
    vi.stubEnv('VITE_USAGE_REPORT_URL', 'https://stats.example.com/usage');
    // 回退 fetch
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetchMock);
    reportOpen('v1.1.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // sendBeacon 抛错 → 静默
    beaconMock.mockImplementation(() => { throw new Error('network down'); });
    expect(() => reportOpen('v1.1.0')).not.toThrow();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveReport, listReportMetas, loadReport, deleteReport,
} from '../src/stats/report-store';
import type { Report } from '../src/report/types';

const STORAGE_KEY = 'pearl-visit:reports:v1';

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
  vi.restoreAllMocks();
});

function makeReport(schoolName: string, studentCount = 3): Report {
  return {
    title: '走访参考报告', schoolName, cohort: '2026级',
    generatedAt: '2026-08-27 10:00',
    schoolAnalysis: {
      overview: '本校共 3 名候选学生。', studentCount,
      difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
      keyVerificationTopics: [], interviewSuggestions: [],
    },
    students: Array.from({ length: studentCount }, (_, i) => ({
      studentId: `student-00${i + 1}`, summary: 's', familySituation: 'f',
      mainDifficultyFactors: [], informationToVerify: [],
      interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
    })),
    studentsData: [],
  };
}

describe('report-store（报告本地存档，30 天过期）', () => {
  it('保存 → 列表元信息正确（学校/人数/时间/剩余天数），且不含完整报告与姓名映射', () => {
    const nameIndex = new Map([['student-001', '测试甲']]);
    const r = saveReport(makeReport('某县第一中学'), nameIndex);
    expect(r.ok).toBe(true);
    const metas = listReportMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].schoolName).toBe('某县第一中学');
    expect(metas[0].studentCount).toBe(3);
    expect(metas[0].remainingMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    // 元信息只含摘要字段，不含姓名映射
    expect(JSON.stringify(metas)).not.toContain('测试甲');
  });

  it('读取返回完整报告与姓名映射，并刷新最后访问时间（访问即续期）', () => {
    vi.useFakeTimers();
    try {
      const saved = saveReport(makeReport('某中学'), new Map([['student-001', '测试甲']]));
      if (!saved.ok) throw new Error('save failed');
      const before = listReportMetas()[0].lastAccessedAt;
      vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000); // 10 天后访问
      const loaded = loadReport(saved.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.report.schoolName).toBe('某中学');
      expect(loaded!.nameIndex['student-001']).toBe('测试甲');
      expect(loaded!.lastAccessedAt).not.toBe(before);
      // 访问即续期：剩余有效期回到接近满值（30 天）
      expect(listReportMetas()[0].remainingMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('30 天未访问自动过期：列表不再显示、读取返回 null、过期项被清除', () => {
    const saved = saveReport(makeReport('过期中学'));
    if (!saved.ok) throw new Error('save failed');
    // 把该存档的最后访问时间改成 31 天前（模拟构造，等价于过期状态）
    const now = Date.now();
    const obj = JSON.parse(storage.getItem(STORAGE_KEY)!);
    obj.reports[0].lastAccessedAt = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
    storage.setItem(STORAGE_KEY, JSON.stringify(obj));

    expect(listReportMetas()).toHaveLength(0);
    expect(loadReport(saved.id)).toBeNull();
    // 过期项已物理删除
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).reports).toHaveLength(0);
  });

  it('彻底删除：列表消失且存储中物理移除；重复删除幂等', () => {
    const a = saveReport(makeReport('甲中学'));
    const b = saveReport(makeReport('乙中学'));
    if (!a.ok || !b.ok) throw new Error('save failed');
    deleteReport(a.id);
    const metas = listReportMetas();
    expect(metas.map((m) => m.schoolName)).toEqual(['乙中学']);
    deleteReport(a.id); // 幂等
    expect(listReportMetas()).toHaveLength(1);
  });

  it('存储损坏（非 JSON / 结构不对）→ 按空态处理不抛错，可重新保存', () => {
    storage.setItem(STORAGE_KEY, 'broken {{{');
    expect(listReportMetas()).toEqual([]);
    expect(loadReport('x')).toBeNull();
    const r = saveReport(makeReport('新中学'));
    expect(r.ok).toBe(true);
    expect(listReportMetas()).toHaveLength(1);
  });

  it('localStorage 不可用（getItem/setItem 抛错）→ 保存返回 unavailable，不抛错', () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(saveReport(makeReport('某中学'), new Map()).ok).toBe(false);
    expect(listReportMetas()).toEqual([]);
    expect(loadReport('x')).toBeNull();
    expect(() => deleteReport('x')).not.toThrow();
  });

  it('配额满（setItem 抛 QuotaExceeded）→ 返回 quota 失败标记，不抛错', () => {
    const orig = storage.setItem;
    storage.setItem = (k: string, v: string) => {
      if (k === STORAGE_KEY) throw new Error('QuotaExceededError');
      orig(k, v);
    };
    const r = saveReport(makeReport('满中学'));
    expect(r).toEqual({ ok: false, reason: 'quota' });
  });

  it('多份存档按最近访问倒序排列', () => {
    vi.useFakeTimers();
    try {
      const a = saveReport(makeReport('甲中学'));
      vi.advanceTimersByTime(2); // 确保两次保存时间戳可区分
      const b = saveReport(makeReport('乙中学'));
      if (!a.ok || !b.ok) throw new Error('save failed');
      // 乙最后保存 → 倒序第一
      expect(listReportMetas().map((m) => m.schoolName)).toEqual(['乙中学', '甲中学']);
      // 访问甲后，甲升到第一（访问即续期 + 排序刷新）
      vi.advanceTimersByTime(2);
      expect(loadReport(a.id)).not.toBeNull();
      expect(listReportMetas().map((m) => m.schoolName)).toEqual(['甲中学', '乙中学']);
    } finally {
      vi.useRealTimers();
    }
  });
});

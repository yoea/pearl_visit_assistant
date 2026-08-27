// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReportArchiveList from '../src/components/ReportArchiveList';
import { saveReport } from '../src/stats/report-store';
import type { Report } from '../src/report/types';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

function makeReport(schoolName: string): Report {
  return {
    title: '走访参考报告', schoolName, cohort: '2026级',
    generatedAt: '2026-08-27 10:00',
    schoolAnalysis: {
      overview: '本校共 1 名候选学生。', studentCount: 1,
      difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
      keyVerificationTopics: [], interviewSuggestions: [],
    },
    students: [{
      studentId: 'student-001', summary: 's', familySituation: 'f',
      mainDifficultyFactors: [], informationToVerify: [],
      interviewQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'], interviewNotes: [],
    }],
    studentsData: [],
  };
}

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  (globalThis as Record<string, unknown>).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  cleanup();
  vi.restoreAllMocks();
});

describe('ReportArchiveList（主页存档列表）', () => {
  it('无存档时不渲染（不占页面空间）', () => {
    const { container } = render(<ReportArchiveList onOpen={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('有存档时显示学校名称/人数/分析日期/到期天数；点击条目触发 onOpen', () => {
    const saved = saveReport(makeReport('某县第一中学'));
    if (!saved.ok) throw new Error('save failed');
    const onOpen = vi.fn();
    render(<ReportArchiveList onOpen={onOpen} />);
    expect(screen.getByText('某县第一中学（2026级）')).toBeTruthy();
    expect(screen.getByText('1 名学生')).toBeTruthy();
    expect(screen.getByText(/分析日期：/)).toBeTruthy();
    expect(screen.getByText(/天后到期/)).toBeTruthy();
    fireEvent.click(screen.getByText('某县第一中学（2026级）'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(saved.id);
  });

  it('删除按钮：确认后移除并刷新列表；取消确认不删除', () => {
    const a = saveReport(makeReport('甲中学'));
    const b = saveReport(makeReport('乙中学'));
    if (!a.ok || !b.ok) throw new Error('save failed');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ReportArchiveList onOpen={() => {}} />);
    // 取消确认：列表不变
    fireEvent.click(screen.getAllByText('删除')[0]);
    expect(screen.getByText('甲中学（2026级）')).toBeTruthy();
    // 确认删除：该条移除，另一条保留
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getAllByText('删除')[0]);
    expect(screen.queryByText('甲中学（2026级）')).toBeNull();
    expect(screen.getByText('乙中学（2026级）')).toBeTruthy();
  });
});

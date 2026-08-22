import { describe, it, expect } from 'vitest';
import { InMemoryUsageStats } from '../src/stats/usage-stats';

describe('InMemoryUsageStats', () => {
  it('计数事件与学生人数总和', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 32 });
    stats.record('imported', { studentCount: 45 });
    stats.record('analysisCompleted');
    expect(stats.getSnapshot()).toEqual({ imports: 2, analyses: 1, totalStudents: 77 });
  });

  it('快照只含白名单计数（绝不包含学生数据）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 1 });
    const snap = stats.getSnapshot();
    expect(Object.keys(snap).sort()).toEqual(['analyses', 'imports', 'totalStudents']);
    expect(JSON.stringify(snap)).not.toContain('学生');
  });

  it('imported 缺 meta 时人数按 0 计（?? 0 默认值）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported');
    expect(stats.getSnapshot()).toEqual({ imports: 1, analyses: 0, totalStudents: 0 });
  });

  it('快照为副本：修改快照不影响后续快照', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 5 });
    const snap = stats.getSnapshot();
    snap.imports = 999;
    snap.totalStudents = 0;
    expect(stats.getSnapshot()).toEqual({ imports: 1, analyses: 0, totalStudents: 5 });
  });
});

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
});

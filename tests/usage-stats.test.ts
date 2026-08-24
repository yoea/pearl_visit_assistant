import { describe, it, expect } from 'vitest';
import { InMemoryUsageStats } from '../src/stats/usage-stats';

describe('InMemoryUsageStats', () => {
  it('计数事件与学生人数总和（分析完成 = 成功 + 失败）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 32 });
    stats.record('imported', { studentCount: 45 });
    stats.record('analysisStarted');
    stats.record('analysisSucceeded');
    stats.record('analysisFailed', { errorCategory: 'timeout' });
    expect(stats.getSnapshot()).toEqual({
      imports: 2, analyses: 1, analysisFailures: 1, totalStudents: 77,
    });
  });

  it('analysisStarted 不计入任何计数（启动次数 = 成功 + 失败推导）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('analysisStarted');
    expect(stats.getSnapshot()).toEqual({
      imports: 0, analyses: 0, analysisFailures: 0, totalStudents: 0,
    });
  });

  it('快照只含白名单计数（绝不包含学生数据/错误详情）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 1 });
    stats.record('analysisFailed', { errorCategory: 'format' });
    const snap = stats.getSnapshot();
    expect(Object.keys(snap).sort()).toEqual(['analyses', 'analysisFailures', 'imports', 'totalStudents']);
    expect(JSON.stringify(snap)).not.toContain('学生');
  });

  it('errorCategory 只接受白名单键（类型级：多余键被忽略，失败类别字符串不参与快照）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('analysisFailed', { errorCategory: 'timeout', studentCount: 99 } as never);
    // 失败事件绝不计入学生人数（导入已计过）
    expect(stats.getSnapshot().totalStudents).toBe(0);
  });

  it('imported 缺 meta 时人数按 0 计', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported');
    expect(stats.getSnapshot()).toEqual({
      imports: 1, analyses: 0, analysisFailures: 0, totalStudents: 0,
    });
  });

  it('快照为副本：修改快照不影响后续快照', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 5 });
    const snap = stats.getSnapshot();
    snap.imports = 999;
    snap.totalStudents = 0;
    expect(stats.getSnapshot()).toEqual({
      imports: 1, analyses: 0, analysisFailures: 0, totalStudents: 5,
    });
  });
});

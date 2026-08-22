/** 统计白名单事件：只允许计数，绝不包含任何学生数据 */
export type UsageEvent = 'imported' | 'analysisCompleted';

export interface UsageSnapshot {
  imports: number;
  analyses: number;
  totalStudents: number; // 学生人数总和（平均人数由此推导）
}

export interface UsageStats {
  record(event: UsageEvent, meta?: { studentCount?: number }): void;
  getSnapshot(): UsageSnapshot;
}

/**
 * 内存实现：不持久化、不上报。
 * 未来如需上报，只能上报 UsageSnapshot 中的白名单计数。
 */
export class InMemoryUsageStats implements UsageStats {
  private imports = 0;
  private analyses = 0;
  private totalStudents = 0;

  record(event: UsageEvent, meta?: { studentCount?: number }): void {
    switch (event) {
      case 'imported':
        this.imports += 1;
        this.totalStudents += meta?.studentCount ?? 0;
        break;
      case 'analysisCompleted':
        this.analyses += 1;
        break;
      default: {
        // 白名单外事件故意静默忽略（fail-safe 语义，运行时绝不抛异常）；
        // never 标注保证编译期穷尽当前 UsageEvent 联合类型（新增事件时在此显式处理）。
        const _unhandled: never = event;
        void _unhandled;
      }
    }
  }

  getSnapshot(): UsageSnapshot {
    return { imports: this.imports, analyses: this.analyses, totalStudents: this.totalStudents };
  }
}

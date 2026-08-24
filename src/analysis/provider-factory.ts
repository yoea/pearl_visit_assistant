import { AnalysisService } from './analysis-service';
import { MockAnalysisProvider } from './mock-provider';
import { AnalysisClient, DEFAULT_TIMEOUT_MS } from './analysis-client';
import { DeepSeekAnalysisProvider } from './deepseek-provider';

export interface AnalysisServiceConfig {
  /** 覆盖 VITE_ANALYSIS_API_URL（测试/特殊部署用） */
  apiUrl?: string;
  /** 覆盖 VITE_ANALYSIS_TIMEOUT_MS（默认 30000） */
  timeoutMs?: number;
}

function resolveTimeout(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * 分析服务工厂：UI 唯一入口。
 * provider 种类由环境变量 VITE_ANALYSIS_PROVIDER 决定：'real' | 'mock'（默认，含未设置与未知值）。
 * real 但未配置 VITE_ANALYSIS_API_URL → 回退 Mock + console.warn 常量提示（绝不静默假装真实 AI）。
 * 网络类（DeepSeekAnalysisProvider / AnalysisClient）不从此模块导出。
 * 绝不引入任何 API Key 相关环境变量（Key 只存在于分析服务器端）。
 */
export function createAnalysisService(config: AnalysisServiceConfig = {}): AnalysisService {
  const provider = import.meta.env.VITE_ANALYSIS_PROVIDER?.trim().toLowerCase();
  if (provider === 'real') {
    const apiUrl = config.apiUrl ?? import.meta.env.VITE_ANALYSIS_API_URL;
    if (!apiUrl) {
      console.warn('已配置真实 AI 分析但未提供 API 地址，本次会话回退到本地模拟分析。');
      return new AnalysisService(new MockAnalysisProvider());
    }
    const timeoutMs = resolveTimeout(
      config.timeoutMs !== undefined
        ? String(config.timeoutMs)
        : import.meta.env.VITE_ANALYSIS_TIMEOUT_MS,
    );
    return new AnalysisService(
      new DeepSeekAnalysisProvider(new AnalysisClient({ apiUrl, timeoutMs })),
    );
  }
  return new AnalysisService(new MockAnalysisProvider());
}

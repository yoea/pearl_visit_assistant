import { AnalysisService } from './analysis-service';
import { MockAnalysisProvider } from './mock-provider';
import { AnalysisClient, DEFAULT_TIMEOUT_MS } from './analysis-client';
import { DeepSeekAnalysisProvider } from './deepseek-provider';

export interface AnalysisServiceConfig {
  /** 覆盖 VITE_DEEPSEEK_API_KEY（测试/特殊部署用） */
  apiKey?: string;
  /** 覆盖 VITE_ANALYSIS_TIMEOUT_MS（默认 60000） */
  timeoutMs?: number;
}

function resolveTimeout(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * 分析服务工厂：UI 唯一入口。
 * provider 种类由环境变量 VITE_ANALYSIS_PROVIDER 决定：'real' | 'mock'（默认，含未设置与未知值）。
 * real 但未配置 VITE_DEEPSEEK_API_KEY → 回退 Mock + console.warn 常量提示（绝不静默假装真实 AI）。
 * 网络类（DeepSeekAnalysisProvider / AnalysisClient）不从此模块导出。
 * 部署形态：办公室局域网（x96max 托管页面），浏览器脱敏后直连 DeepSeek；
 * Key 经 VITE_DEEPSEEK_API_KEY 注入构建产物——由用户明确授权的局域网部署决策，非通用默认。
 */
export function createAnalysisService(config: AnalysisServiceConfig = {}): AnalysisService {
  const provider = import.meta.env.VITE_ANALYSIS_PROVIDER?.trim().toLowerCase();
  if (provider === 'real') {
    const apiKey = config.apiKey ?? import.meta.env.VITE_DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.warn('已配置真实 AI 分析但未提供 DeepSeek API Key，本次会话回退到本地模拟分析。');
      return new AnalysisService(new MockAnalysisProvider());
    }
    const timeoutMs = resolveTimeout(
      config.timeoutMs !== undefined
        ? String(config.timeoutMs)
        : import.meta.env.VITE_ANALYSIS_TIMEOUT_MS,
    );
    return new AnalysisService(
      new DeepSeekAnalysisProvider(new AnalysisClient({ apiKey, timeoutMs })),
    );
  }
  return new AnalysisService(new MockAnalysisProvider());
}

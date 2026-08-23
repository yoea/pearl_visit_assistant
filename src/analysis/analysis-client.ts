import {
  parseResponseText, wireResponseSchema,
  type WireAnalysisRequest, type WireAnalysisResponse,
} from './payload';

export type AnalysisErrorCategory =
  | 'network' | 'timeout' | 'configuration' | 'rate-limited' | 'server' | 'format';

/** 用户可见文案（绝不展示服务端错误原文）。SecurityViolationError 文案由 analysis-service 提供。 */
export const CATEGORY_MESSAGES: Record<AnalysisErrorCategory, string> = {
  network: '网络连接失败，请检查网络后重试。',
  timeout: '分析请求超时，请稍后重试。',
  configuration: '分析服务配置有误，请联系系统管理员。',
  'rate-limited': '请求过于频繁，请稍候片刻再试。',
  server: '分析服务暂时不可用，请稍后重试。',
  format: '分析结果格式异常，请重试；若反复出现请联系系统管理员。',
};

export class AnalysisClientError extends Error {
  constructor(readonly category: AnalysisErrorCategory) {
    super(CATEGORY_MESSAGES[category]);
    this.name = 'AnalysisClientError';
  }
}

export interface AnalysisClientConfig {
  apiUrl: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 纯网络层：唯一 fetch 出口（no-persistence 守卫白名单锁定本文件）。
 * 只接受 WireAnalysisRequest（原始对象类型在此编译期不兼容）。
 * 职责：POST → 状态码分类 → JSON 修复一次 → zod 校验。绝不输出任何日志、绝不读取调用方其他数据。
 */
export class AnalysisClient {
  constructor(private readonly config: AnalysisClientConfig) {}

  async analyze(payload: WireAnalysisRequest): Promise<WireAnalysisResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new AnalysisClientError('timeout');
      throw new AnalysisClientError('network');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 429) throw new AnalysisClientError('rate-limited');
      if (response.status >= 500) throw new AnalysisClientError('server');
      throw new AnalysisClientError('configuration');
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AnalysisClientError('network');
    }

    const raw = parseResponseText(text);
    if (raw === null) throw new AnalysisClientError('format');
    const parsed = wireResponseSchema.safeParse(raw);
    if (!parsed.success) throw new AnalysisClientError('format');
    return parsed.data;
  }
}

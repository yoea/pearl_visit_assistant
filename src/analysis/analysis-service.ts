import { scanPayload, type SecurityFinding } from '../security/scanner';
import type { AnalysisRequest } from '../types/student';
import type { AnalysisProvider, AnalysisResult } from './provider';

/** UI 分类错误用：经本模块汇聚导出（App 不直接依赖网络模块 analysis-client） */
export { AnalysisClientError } from './analysis-client';

export class SecurityViolationError extends Error {
  constructor(public readonly findings: ReadonlyArray<SecurityFinding>) {
    super('数据未通过发送前安全检查，已阻止发送，请返回检查数据。');
    this.name = 'SecurityViolationError';
  }
}

/**
 * 唯一发请求处。安全硬闸在此执行：UI 无法绕过。
 * 未来接入 DeepSeek 时必须继续通过本服务发送（硬闸自动生效，UI 不得直连 provider）；
 * 同时必须遵守两条红线：① UI 无法绕过本服务直发请求（仅本服务构造请求体）；
 * ② AI 输出绝不包含「通过/淘汰」类结论（需在提示词与输出校验中显式实现）。
 */
export class AnalysisService {
  constructor(private readonly provider: AnalysisProvider) {}

  /** provider 身份（'mock' | 'deepseek'）：UI 据此显示模拟/真实徽标，绝不静默假装真实 AI */
  get providerName(): string {
    return this.provider.name;
  }

  async analyze(request: AnalysisRequest, nameBlacklist: Set<string>): Promise<AnalysisResult> {
    const scan = scanPayload(request, nameBlacklist);
    if (!scan.passed) {
      throw new SecurityViolationError(scan.findings);
    }
    return this.provider.analyze(request);
  }
}

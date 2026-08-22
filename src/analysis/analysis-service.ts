import { scanPayload, type SecurityFinding } from '../security/scanner';
import type { AnalysisRequest } from '../types/student';
import type { AnalysisProvider, AnalysisResult } from './provider';

export class SecurityViolationError extends Error {
  constructor(public readonly findings: SecurityFinding[]) {
    super('发送前安全检查未通过');
    this.name = 'SecurityViolationError';
  }
}

/**
 * 唯一发请求处。安全硬闸在此执行：UI 无法绕过。
 * 未来接入 DeepSeek 时必须继续通过本服务发送。
 */
export class AnalysisService {
  constructor(private readonly provider: AnalysisProvider) {}

  async analyze(request: AnalysisRequest, nameBlacklist: Set<string>): Promise<AnalysisResult> {
    const scan = scanPayload(request, nameBlacklist);
    if (!scan.passed) {
      throw new SecurityViolationError(scan.findings);
    }
    return this.provider.analyze(request);
  }
}

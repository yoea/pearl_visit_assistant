import { scanPayload } from '../security/scanner';
import { SecurityViolationError } from './analysis-service';
import { AnalysisClient, AnalysisClientError } from './analysis-client';
import {
  createAnalysisPayload, scanOutboundPayload,
  type WireAnalysisResponse,
} from './payload';
import type { AnalysisProvider, AnalysisResult } from './provider';
import type { AnalysisRequest } from '../types/student';

/** 响应学生集合必须与请求一一对应（顺序不限），否则按格式错误处理（绝不静默丢学生） */
function assertStudentMatch(request: AnalysisRequest, wire: WireAnalysisResponse): void {
  const requestIds = new Set(request.students.map((s) => s.anonymousId));
  const responseIds = wire.students.map((s) => s.studentId);
  if (
    responseIds.length !== request.students.length
    || new Set(responseIds).size !== responseIds.length
    || responseIds.some((id) => !requestIds.has(id))
  ) {
    throw new AnalysisClientError('format');
  }
}

/** v4 UUID：randomUUID 仅安全上下文可用，内网 http 部署需手写回退 */
function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/**
 * DeepSeek 分析提供者（经分析服务器中转，前端绝不接触 API Key）。
 * 安全链：重扫②（不信任调用方）→ createAnalysisPayload（唯一出站构造点）→ 出站终扫③ → fetch。
 * 任何一步失败即抛 SecurityViolationError / AnalysisClientError，绝不发送。
 * 本类与 AnalysisClient 不公共导出：仅 provider-factory 内部构造。
 */
export class DeepSeekAnalysisProvider implements AnalysisProvider {
  readonly name = 'deepseek';

  constructor(private readonly client: AnalysisClient) {}

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    // 重扫②：规则级扫描（姓名黑名单上下文检查由 AnalysisService 硬闸①负责）
    const rescan = scanPayload(request, new Set());
    if (!rescan.passed) {
      throw new SecurityViolationError(rescan.findings);
    }

    const payload = createAnalysisPayload(request, newRequestId());

    // 出站终扫③：对最终 wire 结构做规则 + 禁止字段名 + 结构守卫
    const outbound = scanOutboundPayload(payload);
    if (!outbound.passed) {
      throw new SecurityViolationError(outbound.findings);
    }

    const wire = await this.client.analyze(payload);
    assertStudentMatch(request, wire);
    // wire 响应经 zod 校验后形状与领域结构一致（契约同构），直接作为分析结果
    return wire;
  }
}

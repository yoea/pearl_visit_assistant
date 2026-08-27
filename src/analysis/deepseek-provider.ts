import { scanPayload } from '../security/scanner';
import { SecurityViolationError } from './analysis-service';
import { AnalysisClient, AnalysisClientError } from './analysis-client';
import {
  createAnalysisPayload, scanOutboundPayload,
  type WireAnalysisResponse,
} from './payload';
import type { AnalysisProvider, AnalysisResult, TokenUsage } from './provider';
import type { AnalysisRequest } from '../types/student';

/** 分批参数：单批学生数（输出 8000 token 上限内的安全余量）与并行请求数 */
const CHUNK_SIZE = 10;
const MAX_CONCURRENCY = 5;

/** 有限并发映射：保持结果顺序与输入一致 */
async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

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
 * DeepSeek 分析提供者（直连 DeepSeek；Key 由 AnalysisClient 持有——局域网部署形态，用户明确授权）。
 * 安全链：重扫②（不信任调用方）→ createAnalysisPayload（唯一出站构造点）→ 出站终扫③ → fetch。
 * 任何一步失败即抛 SecurityViolationError / AnalysisClientError，绝不发送。
 * 大批量策略：学生按 CHUNK_SIZE 分批并行请求（避免 8000 token 输出截断），
 * 全部成功后汇总——students 按批序合并、schoolAnalysis 取首批、整体 id 一一对应校验。
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

    // 分块（≤ CHUNK_SIZE 时单批，行为与不分批一致）
    const chunks: AnalysisRequest[] = [];
    for (let i = 0; i < request.students.length; i += CHUNK_SIZE) {
      chunks.push({ meta: request.meta, students: request.students.slice(i, i + CHUNK_SIZE) });
    }

    const results = await mapWithConcurrency(chunks, MAX_CONCURRENCY, async (chunk) => {
      const payload = createAnalysisPayload(chunk, newRequestId(), request.students.length);

      // 出站终扫③：对每批最终 wire 结构做规则 + 禁止字段名 + 结构守卫
      const outbound = scanOutboundPayload(payload);
      if (!outbound.passed) {
        throw new SecurityViolationError(outbound.findings);
      }

      return this.client.analyze(payload);
    });

    // 汇总：students 按批序合并；schoolAnalysis 取首批（基于首批学生视角的学校级归纳）
    const wire: WireAnalysisResponse = {
      ...results[0].result,
      students: results.flatMap((r) => r.result.students),
    };
    assertStudentMatch(request, wire);
    // token 用量：各批（含批内重试）求和，供统计与本地累计
    const usage: TokenUsage = results.reduce(
      (sum, r) => ({
        apiCalls: sum.apiCalls + r.usage.apiCalls,
        promptTokens: sum.promptTokens + r.usage.promptTokens,
        completionTokens: sum.completionTokens + r.usage.completionTokens,
        cacheHitTokens: sum.cacheHitTokens + r.usage.cacheHitTokens,
      }),
      { apiCalls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 } satisfies TokenUsage,
    );
    // wire 响应经 zod 校验后形状与领域结构一致（契约同构），直接作为分析结果
    return { ...wire, usage };
  }
}

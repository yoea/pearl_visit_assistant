import { scanPayload } from '../security/scanner';
import { SecurityViolationError } from './analysis-service';
import { AnalysisClient, AnalysisClientError } from './analysis-client';
import {
  createAnalysisPayload, scanOutboundPayload,
  createSchoolSummaryPayload, scanSchoolSummaryPayload,
  type WireAnalysisResponse,
} from './payload';
import type { AnalysisProvider, AnalysisResult, TokenUsage } from './provider';
import type { AnalysisRequest } from '../types/student';

/** 分批参数：单批学生数（实测 10 人约需 7.5k 输出 token，MAX_OUTPUT_TOKENS=32768 下余量充足）与并行请求数 */
const CHUNK_SIZE = 10;
const MAX_CONCURRENCY = 5;

/** token 用量零值 */
function emptyUsage(): TokenUsage {
  return { apiCalls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };
}

/** token 用量逐项求和（批次间与拆批重试间通用） */
function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    apiCalls: a.apiCalls + b.apiCalls,
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    cacheHitTokens: a.cacheHitTokens + b.cacheHitTokens,
  };
}

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
 * 大批量策略：学生按 CHUNK_SIZE 分批并行请求，全部成功后汇总——
 * students 按批序合并、整体 id 一一对应校验；**学校级归纳另起一次汇总调用**合并全部批次
 * （每批只见到自己那 ≤10 人，直接取首批会让学校整体情况/材料质量提示漏掉后面的学生）。
 * 单批输出被截断（truncated）时自动拆半重试（见 analyzeBatch）。
 * 本类与 AnalysisClient 不公共导出：仅 provider-factory 内部构造。
 */
export class DeepSeekAnalysisProvider implements AnalysisProvider {
  readonly name = 'deepseek';

  constructor(private readonly client: AnalysisClient) {}

  /**
   * 单批分析：安全链（终扫③）→ 一次 client 调用。
   *
   * 若该批输出被输出上限截断（truncated）：**拆半重试**。原样重发同一批内容必然再次截断
   * （修正提示不会让必写内容变短），而拆小后单批信息量下降、输出随之变短，通常一次即可通过。
   * 拆到单名学生仍被截断才向上抛（避免无限递归；每次拆半，条目数严格递减必然收敛）。
   * usage 为各分片成功调用之和。
   */
  private async analyzeBatch(
    meta: AnalysisRequest['meta'],
    students: AnalysisRequest['students'],
    totalStudents: number,
  ): Promise<{ result: WireAnalysisResponse; usage: TokenUsage }> {
    const payload = createAnalysisPayload({ meta, students }, newRequestId(), totalStudents);

    // 出站终扫③：对每批最终 wire 结构做规则 + 禁止字段名 + 结构守卫
    const outbound = scanOutboundPayload(payload);
    if (!outbound.passed) {
      throw new SecurityViolationError(outbound.findings);
    }

    try {
      return await this.client.analyze(payload);
    } catch (e) {
      if (e instanceof AnalysisClientError && e.category === 'truncated' && students.length > 1) {
        const mid = Math.ceil(students.length / 2);
        const halves = await Promise.all([
          this.analyzeBatch(meta, students.slice(0, mid), totalStudents),
          this.analyzeBatch(meta, students.slice(mid), totalStudents),
        ]);
        return {
          // 分片的 schoolAnalysis 会在最后被全校汇总调用取代，这里取前半片仅为占位
          result: {
            ...halves[0].result,
            students: halves.flatMap((h) => h.result.students),
          },
          usage: halves.reduce((sum, h) => addUsage(sum, h.usage), emptyUsage()),
        };
      }
      throw e;
    }
  }

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

    const results = await mapWithConcurrency(chunks, MAX_CONCURRENCY, (chunk) =>
      this.analyzeBatch(chunk.meta, chunk.students, request.students.length));

    // students 按批序合并
    const students = results.flatMap((r) => r.result.students);

    // 学校级归纳必须覆盖全校，**不能取首批**：每批只见到自己的 ≤10 名学生，
    // 取首批会让「学校整体情况」「材料质量提示」等只反映前 10 名学生。
    // 因此把各批的学校级归纳交给一次汇总调用合并、去重、归纳成全校结论。
    const summaryPayload = createSchoolSummaryPayload(
      request, results.map((r) => r.result.schoolAnalysis), newRequestId(), request.students.length,
    );
    // 汇总请求的出站终扫③：模型产出的学校级文案仍可能混入敏感片段，照常扫描后才发送
    const summaryScan = scanSchoolSummaryPayload(summaryPayload);
    if (!summaryScan.passed) {
      throw new SecurityViolationError(summaryScan.findings);
    }
    // 汇总输出只有一个 schoolAnalysis（量级远小于 32768 上限），故不做拆批重试；
    // 若仍被截断则按 truncated 上报
    const summary = await this.client.summarizeSchool(summaryPayload);

    const wire: WireAnalysisResponse = {
      version: results[0].result.version,
      schoolAnalysis: summary.result.schoolAnalysis,
      students,
    };
    assertStudentMatch(request, wire);
    // token 用量：各批（含批内 JSON 修复重试、截断拆批重试）与汇总调用求和，供统计与本地累计
    const usage: TokenUsage = [...results.map((r) => r.usage), summary.usage]
      .reduce((sum, u) => addUsage(sum, u), emptyUsage());
    // wire 响应经 zod 校验后形状与领域结构一致（契约同构），直接作为分析结果
    return { ...wire, usage };
  }
}

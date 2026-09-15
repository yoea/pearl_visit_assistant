import {
  parseResponseText, wireResponseSchema, wireSchoolSummaryResponseSchema,
  type WireAnalysisRequest, type WireAnalysisResponse,
  type WireSchoolSummaryRequest, type WireSchoolSummaryResponse,
} from './payload';
import { DEEPSEEK_SYSTEM_PROMPT, DEEPSEEK_SCHOOL_SUMMARY_PROMPT } from './system-prompt';
import type { TokenUsage } from './provider';
import type { ZodError, ZodType } from 'zod';

export type AnalysisErrorCategory =
  | 'network' | 'timeout' | 'configuration' | 'rate-limited' | 'server' | 'format' | 'truncated';

/** 用户可见文案（绝不展示服务端错误原文）。SecurityViolationError 文案由 analysis-service 提供。 */
export const CATEGORY_MESSAGES: Record<AnalysisErrorCategory, string> = {
  network: '网络连接失败，请检查网络后重试。',
  timeout: '分析请求超时，请稍后重试。',
  configuration: '分析服务配置有误，请联系系统管理员。',
  'rate-limited': '请求过于频繁，请稍候片刻再试。',
  server: '分析服务暂时不可用，请稍后重试。',
  format: '分析结果格式异常，请重试；若反复出现请联系系统管理员。',
  truncated: '分析内容过长导致模型输出被截断，请减少单次上传的学生数后重试。',
};

export class AnalysisClientError extends Error {
  constructor(readonly category: AnalysisErrorCategory) {
    super(CATEGORY_MESSAGES[category]);
    this.name = 'AnalysisClientError';
  }
}

export interface AnalysisClientConfig {
  /** DeepSeek API Key（局域网部署形态：注入构建产物，由用户明确授权） */
  apiKey: string;
  model?: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
/**
 * 单次请求的输出 token 上限。上限本身不额外计费，只有模型真正生成的部分才计费。
 *
 * 历史：2026-08-25 定为 8000，当时单批输出约 4.7k，余量充足；
 * 2026-09 起模型对同一批（10 人）学生的输出量上涨约 60% 至约 7.5k，
 * 把 8000 撑满 → JSON 被截断 → 整份报告失败（线上实测失败率 44%）。
 * 放宽到 32768 留出足够余量，并配合 finish_reason 截断检测 + 拆批重试兜底。
 */
export const MAX_OUTPUT_TOKENS = 32_768;
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** 结构校验失败时的修正提示（只含 zod 字段路径与错误，绝不含任何学生数据） */
function correctionHint(err: ZodError): string {
  const issues = err.issues.slice(0, 5)
    .map((i) => `${i.path.join('.') || '根节点'}: ${i.message}`)
    .join('；');
  return `你的上一轮输出未通过结构校验。请重新输出完整 JSON（不要解释、不要代码围栏）。问题如下：${issues}`;
}

const REPAIR_JSON_HINT = '你的上一轮输出无法解析为 JSON。请只输出一个合法的 JSON 对象，不要输出任何其他文字或代码围栏。';

/**
 * 纯网络层：唯一 fetch 出口（no-persistence 守卫白名单锁定本文件）。
 * 只接受 WireAnalysisRequest（原始对象类型在此编译期不兼容）。
 * 两个公开入口共用同一套策略：analyze（逐生分析）与 summarizeSchool（学校级归纳汇总）。
 * 职责：POST DeepSeek（直连，Authorization Bearer Key）→ 状态码分类
 * → choices[0].message.content 提取 → JSON 修复一次 → zod 校验；
 * 模型输出不合格（JSON 修复失败/结构校验失败）时带修正提示自动重试一次，两次失败才报 format。
 * finish_reason=length（被输出上限截断）单独识别为 truncated 并立即抛出，不做修复重试
 * ——原样重发同一批必然再次截断，由上层拆批重试处理。
 * 绝不输出任何日志、绝不读取调用方其他数据、绝不展示上游错误原文。
 */
export class AnalysisClient {
  constructor(private readonly config: AnalysisClientConfig) {}

  async analyze(payload: WireAnalysisRequest): Promise<{ result: WireAnalysisResponse; usage: TokenUsage }> {
    return this.runWithRepair(
      [
        { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      wireResponseSchema,
    );
  }

  /**
   * 学校级归纳汇总（分批分析的二次汇总）。
   * 与 analyze 完全共用请求/修复重试/截断识别策略，只是换成汇总提示词与
   * 「只含 version + schoolAnalysis」的响应契约。
   */
  async summarizeSchool(
    payload: WireSchoolSummaryRequest,
  ): Promise<{ result: WireSchoolSummaryResponse; usage: TokenUsage }> {
    return this.runWithRepair(
      [
        { role: 'system', content: DEEPSEEK_SCHOOL_SUMMARY_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      wireSchoolSummaryResponseSchema,
    );
  }

  /**
   * 共用的「请求 → JSON 修复一次 → zod 校验」循环。
   * 模型输出不合格时带修正提示自动重试一次，两次失败才报 format；
   * finish_reason=length 由 requestContent 直接抛 truncated（不进入重试）。
   * 每次真实 API 调用都计入 apiCalls（修复重试是另一次调用、另一次计费）。
   */
  private async runWithRepair<T>(
    messages: ChatMessage[],
    schema: ZodType<T>,
  ): Promise<{ result: T; usage: TokenUsage }> {
    const usage: TokenUsage = { apiCalls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };
    for (let attempt = 0; ; attempt++) {
      const { content, usage: attemptUsage } = await this.requestContent(messages);
      usage.apiCalls += 1;
      usage.promptTokens += attemptUsage.promptTokens;
      usage.completionTokens += attemptUsage.completionTokens;
      usage.cacheHitTokens += attemptUsage.cacheHitTokens;
      const raw = parseResponseText(content);
      if (raw === null) {
        if (attempt >= 1) throw new AnalysisClientError('format');
        messages.push({ role: 'user', content: REPAIR_JSON_HINT });
        continue;
      }
      const parsed = schema.safeParse(raw);
      if (parsed.success) return { result: parsed.data, usage };
      if (attempt >= 1) throw new AnalysisClientError('format');
      messages.push({ role: 'user', content: correctionHint(parsed.error) });
    }
  }

  /** 单次请求：超时 → 状态码分类 → 响应壳提取。返回模型文本、finish_reason 与该次调用 token 用量；异常一律按分类抛出。 */
  private async requestContent(
    messages: ChatMessage[],
  ): Promise<{ content: string; finishReason: string | undefined; usage: TokenUsage }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model ?? DEFAULT_MODEL,
          messages,
          temperature: 0.3, // 走访分析：低随机度保证可追溯、不跑题
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
          // deepseek-flash 为推理模型：默认思维链会耗尽输出预算使 content 为空/截断
          // （实测思维链≈7-8k 时 content=0 字符 → finish_reason=length）。显式关闭推理。
          thinking: { type: 'disabled' },
        }),
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
      throw new AnalysisClientError('configuration'); // 401/403 Key 无效等
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AnalysisClientError('network');
    }

    // DeepSeek 响应壳：{ choices: [{ message: { content: <模型文本> }, finish_reason }], usage: { prompt_tokens, ... } }
    // usage 为计费依据（仅数字）；缺失时按 0 处理（绝不因统计失败影响主流程）
    let content: string;
    let finishReason: string | undefined;
    let usage: TokenUsage = { apiCalls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };
    try {
      const shell = JSON.parse(text);
      const choice = shell.choices?.[0];
      content = choice?.message?.content;
      finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
      const u = shell.usage;
      if (u && typeof u === 'object') {
        usage = {
          apiCalls: 0,
          promptTokens: finiteNonNeg(u.prompt_tokens),
          completionTokens: finiteNonNeg(u.completion_tokens),
          cacheHitTokens: finiteNonNeg(u.prompt_cache_hit_tokens),
        };
      }
    } catch {
      throw new AnalysisClientError('format');
    }
    // 被输出上限截断：内容必然不完整，且原样重发同一批只会再次截断（修正提示不会让内容变短）
    // → 立即按 truncated 抛出，交由上层拆批重试，不浪费一次注定失败的修复重试
    if (finishReason === 'length') throw new AnalysisClientError('truncated');
    if (typeof content !== 'string' || !content) throw new AnalysisClientError('format');
    return { content, finishReason, usage };
  }
}

/** 安全取数：仅接受有限非负数，否则按 0（usage 缺失/异常绝不抛错） */
function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

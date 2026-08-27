import {
  parseResponseText, wireResponseSchema,
  type WireAnalysisRequest, type WireAnalysisResponse,
} from './payload';
import { DEEPSEEK_SYSTEM_PROMPT } from './system-prompt';
import type { TokenUsage } from './provider';
import type { ZodError } from 'zod';

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
  /** DeepSeek API Key（局域网部署形态：注入构建产物，由用户明确授权） */
  apiKey: string;
  model?: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
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
 * 职责：POST DeepSeek（直连，Authorization Bearer Key）→ 状态码分类
 * → choices[0].message.content 提取 → JSON 修复一次 → zod 校验；
 * 模型输出不合格（JSON 修复失败/结构校验失败）时带修正提示自动重试一次，两次失败才报 format。
 * 绝不输出任何日志、绝不读取调用方其他数据、绝不展示上游错误原文。
 */
export class AnalysisClient {
  constructor(private readonly config: AnalysisClientConfig) {}

  async analyze(payload: WireAnalysisRequest): Promise<{ result: WireAnalysisResponse; usage: TokenUsage }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ];
    // 每次真实 API 调用都计入 apiCalls（JSON 修复重试是另一次调用、另一次计费）
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
      const parsed = wireResponseSchema.safeParse(raw);
      if (parsed.success) return { result: parsed.data, usage };
      if (attempt >= 1) throw new AnalysisClientError('format');
      messages.push({ role: 'user', content: correctionHint(parsed.error) });
    }
  }

  /** 单次请求：超时 → 状态码分类 → 响应壳提取。返回模型文本与该次调用 token 用量；异常一律按七分类抛出。 */
  private async requestContent(messages: ChatMessage[]): Promise<{ content: string; usage: TokenUsage }> {
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
          max_tokens: 8000,
          response_format: { type: 'json_object' },
          // deepseek-v4-flash 为推理模型：默认思维链会耗尽 max_tokens 使 content 为空/截断
          // （实测 reasoning≈7-8k 时 content=0 字符 → finish=length）。显式关闭推理。
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

    // DeepSeek 响应壳：{ choices: [{ message: { content: <模型文本> } }], usage: { prompt_tokens, ... } }
    // usage 为计费依据（仅数字）；缺失时按 0 处理（绝不因统计失败影响主流程）
    let content: string;
    let usage: TokenUsage = { apiCalls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };
    try {
      const shell = JSON.parse(text);
      content = shell.choices?.[0]?.message?.content;
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
    if (typeof content !== 'string' || !content) throw new AnalysisClientError('format');
    return { content, usage };
  }
}

/** 安全取数：仅接受有限非负数，否则按 0（usage 缺失/异常绝不抛错） */
function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

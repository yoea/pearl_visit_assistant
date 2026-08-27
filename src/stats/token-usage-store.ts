import type { TokenUsage } from '../analysis/provider';

/**
 * token 用量本机累计——用户明确授权的唯一持久化放宽：
 * localStorage 仅存 token 计数数字（含两个时间戳），绝不包含任何学生数据。
 * 隐私红线「无持久化」在本模块之外依然全部有效（no-persistence 守卫将
 * localStorage 白名单锁定为本文件）。
 * 字段白名单：analyses / apiCalls / promptTokens / completionTokens / totalTokens /
 * cacheHitTokens / firstRecordedAt / lastRecordedAt。
 * 全程异常安全：localStorage 不可用（隐私模式）、JSON 损坏或被篡改时绝不抛错。
 */

const STORAGE_KEY = 'pearl-visit:token-usage:v1';

export interface CumulativeTokenUsage {
  /** 成功分析次数（仅真实 AI；mock 不计入） */
  analyses: number;
  apiCalls: number;
  promptTokens: number;
  completionTokens: number;
  /** prompt + completion（展示口径，与 DeepSeek total_tokens 一致） */
  totalTokens: number;
  cacheHitTokens: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
}

const EMPTY: CumulativeTokenUsage = {
  analyses: 0, apiCalls: 0, promptTokens: 0, completionTokens: 0,
  totalTokens: 0, cacheHitTokens: 0, firstRecordedAt: null, lastRecordedAt: null,
};

/** 安全取数：仅接受有限非负数，否则按 0（存储损坏/被篡改绝不抛错） */
function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** 从 localStorage 读取累计值（白名单字段逐一校验，异常按空态） */
export function getTokenUsage(): CumulativeTokenUsage {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY;
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return EMPTY;
    const o = obj as Record<string, unknown>;
    return {
      analyses: finiteNonNeg(o.analyses),
      apiCalls: finiteNonNeg(o.apiCalls),
      promptTokens: finiteNonNeg(o.promptTokens),
      completionTokens: finiteNonNeg(o.completionTokens),
      totalTokens: finiteNonNeg(o.totalTokens),
      cacheHitTokens: finiteNonNeg(o.cacheHitTokens),
      firstRecordedAt: typeof o.firstRecordedAt === 'string' ? o.firstRecordedAt : null,
      lastRecordedAt: typeof o.lastRecordedAt === 'string' ? o.lastRecordedAt : null,
    };
  } catch {
    return EMPTY;
  }
}

/** 累加一次真实分析的 token 用量并写回，返回最新快照（写入失败静默忽略，绝不阻塞主流程） */
export function recordTokenUsage(usage: TokenUsage): CumulativeTokenUsage {
  const prev = getTokenUsage();
  const now = new Date().toISOString();
  const next: CumulativeTokenUsage = {
    analyses: prev.analyses + 1,
    apiCalls: prev.apiCalls + usage.apiCalls,
    promptTokens: prev.promptTokens + usage.promptTokens,
    completionTokens: prev.completionTokens + usage.completionTokens,
    totalTokens: prev.totalTokens + usage.promptTokens + usage.completionTokens,
    cacheHitTokens: prev.cacheHitTokens + usage.cacheHitTokens,
    firstRecordedAt: prev.firstRecordedAt ?? now,
    lastRecordedAt: now,
  };
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式/存储满等：统计丢失可接受，绝不因此报错
  }
  return next;
}

import type { TokenUsage } from '../analysis/provider';
import type { CumulativeTokenUsage } from './token-usage-store';

/**
 * 使用情况统计上报（用户授权）：打开工具次数 / 分析报告数 / token 用量 → 统一 POST 到配置接口。
 *
 * 隐私红线（关键约束）：上报 payload 为**白名单纯计数**——工具名、版本号、随机客户端 ID、
 * 事件名、学生人数、token 数字。绝不包含任何学生数据或个人身份信息。
 *
 * 配置：接口地址来自构建期 env `VITE_USAGE_REPORT_URL`；未配置时本模块完全静默
 * （零发送、零影响）。发送失败静默丢弃，绝不重试、绝不阻塞主流程。
 * 网络出口白名单：no-persistence 静态守卫锁定本文件为唯一统计上报出口。
 */

export type UsageEvent = 'open' | 'analysis_succeeded' | 'analysis_failed';

/** 上报请求体（接口契约见 docs/usage-report-api.md，全部字段为白名单） */
export interface UsageReport {
  tool: 'pearl-visit-assistant';
  /** 平台版本号（如 v1.1.0） */
  version: string;
  /** 随机生成的浏览器标识（仅用于区分不同使用者，无个人信息） */
  clientId: string;
  event: UsageEvent;
  /** ISO 8601 时间戳 */
  occurredAt: string;
  payload: {
    /** 本次分析学生数（仅 analysis_succeeded） */
    students?: number;
    /** 失败类别枚举名（仅 analysis_failed；非错误原文） */
    errorCategory?: string;
    /** 本次分析 token 用量（仅 analysis_succeeded 且真实 AI） */
    usage?: {
      apiCalls: number;
      promptTokens: number;
      completionTokens: number;
      cacheHitTokens: number;
    };
    /** 本机累计（仅 analysis_succeeded 且真实 AI；token-usage-store 快照） */
    cumulative?: {
      analyses: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

const TOOL = 'pearl-visit-assistant' as const;
const CLIENT_ID_KEY = 'pearl-visit:client-id';

/** 上报接口地址（env 注入；未配置返回 null → 全部静默） */
function reportUrl(): string | null {
  const url = import.meta.env.VITE_USAGE_REPORT_URL as string | undefined;
  return url && url.trim() !== '' ? url.trim() : null;
}

/** 使用统计页面地址（与上报接口同源，路径 /stats）；未配置上报接口返回 null */
export function usageStatsUrl(): string | null {
  const url = reportUrl();
  if (!url) return null;
  try {
    return new URL('/stats', url).toString();
  } catch {
    return null;
  }
}

/** 浏览器标识：随机 UUID，仅 localStorage 存一次；不可用时回退 'unknown'（绝不抛错） */
function clientId(): string {
  try {
    const existing = globalThis.localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^[0-9a-f-]{20,}$/.test(existing)) return existing;
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    globalThis.localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}

/** 发送上报：sendBeacon 优先（页面关闭也可靠）；任何失败静默丢弃 */
function send(report: UsageReport): void {
  const url = reportUrl();
  if (!url) return;
  const body = JSON.stringify(report);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    // 静默：统计失败不影响主流程
  }
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // 静默
  }
}

/** 打开工具（每次进入页面一次） */
export function reportOpen(version: string): void {
  send({ tool: TOOL, version, clientId: clientId(), event: 'open', occurredAt: new Date().toISOString(), payload: {} });
}

/** 分析成功（携带学生数与 token 用量/累计） */
export function reportAnalysisSucceeded(
  version: string,
  students: number,
  usage: TokenUsage | undefined,
  cumulative: CumulativeTokenUsage | undefined,
): void {
  const payload: UsageReport['payload'] = { students };
  if (usage) {
    payload.usage = {
      apiCalls: usage.apiCalls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cacheHitTokens: usage.cacheHitTokens,
    };
  }
  if (cumulative) {
    payload.cumulative = {
      analyses: cumulative.analyses,
      promptTokens: cumulative.promptTokens,
      completionTokens: cumulative.completionTokens,
      totalTokens: cumulative.totalTokens,
    };
  }
  send({ tool: TOOL, version, clientId: clientId(), event: 'analysis_succeeded', occurredAt: new Date().toISOString(), payload });
}

/** 分析失败（仅类别枚举名，非错误原文） */
export function reportAnalysisFailed(version: string, errorCategory: string): void {
  send({ tool: TOOL, version, clientId: clientId(), event: 'analysis_failed', occurredAt: new Date().toISOString(), payload: { errorCategory } });
}

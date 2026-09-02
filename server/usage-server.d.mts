/** usage-server.mjs 的 TypeScript 声明（仅测试 import 用） */

export function sanitize(body: unknown): Record<string, unknown> | null;

export function parseRecords(text: string): Array<Record<string, unknown>>;

export function summarize(records: Array<Record<string, unknown>>): {
  opens: number;
  succeeded: number;
  failed: number;
  totalStudents: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  uniqueClients: number;
  records: number;
  trend: { date: string; count: number }[];
};

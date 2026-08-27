import type { Report } from '../report/types';

/**
 * 报告本地存档（用户授权）：分析生成的报告存入 localStorage，支持列表/读取/彻底删除，
 * 30 天未访问自动过期删除。
 * 隐私说明：存档含报告全文与「匿名编号 ↔ 真实姓名」映射（nameIndex，走访时对照用）——
 * 数据只落本浏览器 localStorage、绝不上传；这是「无持久化」红线的第二次有限放宽
 * （第一次为 token 计数），no-persistence 守卫白名单锁定本文件。
 * 全程异常安全：localStorage 不可用 / JSON 损坏 / 配额满时绝不抛错（返回失败标记或空态）。
 */

const STORAGE_KEY = 'pearl-visit:reports:v1';
/** 有效期：30 天（1 个月）；按最后访问时间（lastAccessedAt）判定，未访问即过期 */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** 存档记录：id 唯一；report 为报告全文；nameIndex 为匿名编号 → 真实姓名（仅本地） */
interface ArchivedReport {
  id: string;
  report: Report;
  nameIndex: Record<string, string>;
  createdAt: string;
  lastAccessedAt: string;
}

/** 列表展示用元信息（不含完整报告，避免列表加载大 JSON） */
export interface ArchivedReportMeta {
  id: string;
  schoolName: string;
  cohort: string;
  studentCount: number;
  createdAt: string;
  lastAccessedAt: string;
  /** 剩余有效期毫秒数（≤0 表示已过期，将在下次操作时清理） */
  remainingMs: number;
}

interface StoredReports {
  version: 1;
  reports: ArchivedReport[];
}

export type SaveReportResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'quota' | 'unavailable' };

function readStored(): StoredReports {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { version: 1, reports: [] };
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return { version: 1, reports: [] };
    const s = obj as { version?: unknown; reports?: unknown };
    if (s.version !== 1 || !Array.isArray(s.reports)) return { version: 1, reports: [] };
    return { version: 1, reports: s.reports as ArchivedReport[] };
  } catch {
    return { version: 1, reports: [] };
  }
}

function writeStored(s: StoredReports): boolean {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false; // 配额满：尽力而为，绝不抛错
  }
}

/** localStorage 是否可用（隐私模式/禁用时 getItem 抛错） */
function storageAvailable(): boolean {
  try {
    globalThis.localStorage.getItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 清理过期记录（按 lastAccessedAt），返回清理后的容器 */
function pruneExpired(s: StoredReports, now: number): StoredReports {
  const kept = s.reports.filter((r) => {
    const last = Date.parse(r.lastAccessedAt);
    return Number.isFinite(last) && now - last < RETENTION_MS;
  });
  return kept.length === s.reports.length ? s : { version: 1, reports: kept };
}

/** 保存一份报告到本地存档；配额满/不可用时返回失败标记（UI 提示，绝不阻塞分析主流程）。
 *  nameIndex 为「匿名编号 ↔ 真实姓名」映射（可选：无姓名列时省略）。 */
export function saveReport(report: Report, nameIndex?: ReadonlyMap<string, string>): SaveReportResult {
  const now = new Date().toISOString();
  const record: ArchivedReport = {
    id: genId(),
    report,
    nameIndex: Object.fromEntries(nameIndex?.entries() ?? []),
    createdAt: now,
    lastAccessedAt: now,
  };
  if (!storageAvailable()) return { ok: false, reason: 'unavailable' };
  const stored = pruneExpired(readStored(), Date.now());
  stored.reports.push(record);
  if (!writeStored(stored)) return { ok: false, reason: 'quota' };
  return { ok: true, id: record.id };
}

/** 惰性清理：有过期项时物理写回（自动过期删除），返回清理后容器 */
function pruneAndPersist(now: number): StoredReports {
  const raw = readStored();
  const pruned = pruneExpired(raw, now);
  if (pruned.reports.length !== raw.reports.length) writeStored(pruned);
  return pruned;
}

/** 全部存档元信息（清理过期后按最近访问倒序）；无存档返回空数组 */
export function listReportMetas(): ArchivedReportMeta[] {
  const stored = pruneAndPersist(Date.now());
  const now = Date.now();
  return stored.reports
    .map((r) => ({
      id: r.id,
      schoolName: r.report.schoolName,
      cohort: r.report.cohort,
      studentCount: r.report.students.length,
      createdAt: r.createdAt,
      lastAccessedAt: r.lastAccessedAt,
      remainingMs: RETENTION_MS - (now - Date.parse(r.lastAccessedAt)),
    }))
    .sort((a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt));
}

/** 读取一份存档报告（刷新最后访问时间、顺带清理过期）；不存在/已过期返回 null */
export function loadReport(id: string): ArchivedReport | null {
  const stored = pruneAndPersist(Date.now());
  const hit = stored.reports.find((r) => r.id === id);
  if (!hit) return null;
  const now = new Date().toISOString();
  hit.lastAccessedAt = now;
  writeStored(stored);
  return { ...hit };
}

/** 彻底删除一份存档（不存在时静默） */
export function deleteReport(id: string): void {
  const stored = pruneExpired(readStored(), Date.now());
  const kept = stored.reports.filter((r) => r.id !== id);
  if (kept.length !== stored.reports.length) writeStored({ version: 1, reports: kept });
}

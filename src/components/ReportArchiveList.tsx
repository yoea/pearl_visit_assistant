import { useEffect, useState } from 'react';
import { listReportMetas, deleteReport, type ArchivedReportMeta } from '../stats/report-store';
import Card from './ui/Card';

/**
 * 主页「本地已存档的报告」列表：学校名称、人数、分析日期、剩余有效期。
 * 每份报告分析完成后自动存档到本机浏览器存储，30 天未访问自动过期删除。
 * 点击条目进入 AI 分析报告查看页（不在首页直接展开）；条目右侧可直接彻底删除。
 */
export default function ReportArchiveList({ onOpen }: { onOpen: (id: string) => void }) {
  const [metas, setMetas] = useState<ArchivedReportMeta[]>([]);

  // 挂载/每次回到主页时刷新列表（顺带清理过期）
  useEffect(() => {
    setMetas(listReportMetas());
  }, []);

  /** 彻底删除：二次确认后从本机存储移除并刷新列表 */
  const handleDelete = (id: string) => {
    if (!window.confirm('彻底删除后不可恢复。确定删除这份报告的本地存档吗？')) return;
    deleteReport(id);
    setMetas((prev) => prev.filter((m) => m.id !== id));
  };

  if (metas.length === 0) {
    return null; // 无存档：不占页面空间
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-800">本地已存档的报告</h2>
      <p className="mt-1 text-xs text-slate-500">
        自动保存在本浏览器（仅本机，不上传）。每份报告 30 天内未打开查看将自动过期删除。
      </p>
      <ul className="mt-3 space-y-2">
        {metas.map((m) => (
          <li key={m.id} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => onOpen(m.id)}
              className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50"
            >
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-slate-800">
                  {m.schoolName}{m.cohort && m.cohort !== '未填写' ? `（${m.cohort}）` : ''}
                </span>
                <span className="text-xs text-slate-500">{m.studentCount} 名学生</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>分析日期：{fmtTime(m.lastAccessedAt)}</span>
                <span className={m.remainingMs <= 7 * 24 * 60 * 60 * 1000 ? 'font-medium text-amber-600' : ''}>
                  {Math.max(1, Math.ceil(m.remainingMs / (24 * 60 * 60 * 1000)))} 天后到期
                </span>
                <span className="text-emerald-700">查看 →</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(m.id)}
              title="彻底删除这份存档"
              className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 hover:text-red-800"
            >
              删除
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** ISO 时间 → 「YYYY-MM-DD HH:mm」（本机时区） */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

import { useEffect, useMemo, useState } from 'react';
import type { Report } from '../report/types';
import type { StudentAnalysis, TokenUsage } from '../analysis/provider';
import type { CumulativeTokenUsage } from '../stats/token-usage-store';
import type { AnonymizedStudent } from '../types/student';
import { reportToMarkdown } from '../report/markdown';
import { reportToHtml } from '../report/html';
import { downloadTextFile } from '../utils/download';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import { checkNumericIssues, NUMERIC_ERROR_LABEL } from '../anonymization/numeric-validation';
import { APP_VERSION } from '../app-config';
import { reportReportDownloaded, reportStudentSearch } from '../stats/usage-reporter';
import { countReviewStatuses, reviewStatusTone, REVIEW_STATUS_COLORS } from '../report/review-status';
import { countDifficultyReasons } from '../report/difficulty-reason';
import { exportIssuesCsv } from '../report/issue-csv';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';

const IMPORTANCE_TONE: Record<string, string> = { high: 'amber', medium: 'blue', low: 'slate' };

/** token 数字千分位格式化（仅展示用途） */
function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** 轻量 CSS 条形图（无外部图表依赖，自包含） */
function MiniBarChart({ items, color }: { items: { label: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-xs">
          <span className="w-14 shrink-0 text-right text-slate-500">{i.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-200/70">
            <div
              className={`h-4 rounded-full ${color}`}
              style={{ width: `${((i.count / max) * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-slate-600">{i.count} 人</span>
        </div>
      ))}
    </div>
  );
}

/** 审核状态环形饼图（CSS conic-gradient，零依赖）；items 为空返回 null */
function DonutChart({ items }: { items: { label: string; count: number }[] }) {
  const total = items.reduce((a, i) => a + i.count, 0);
  if (total <= 0) return null;
  let acc = 0;
  const stops = items.map((i, idx) => {
    const from = (acc / total) * 360;
    acc += i.count;
    const to = (acc / total) * 360;
    return `${REVIEW_STATUS_COLORS[idx % REVIEW_STATUS_COLORS.length]} ${from.toFixed(2)}deg ${to.toFixed(2)}deg`;
  }).join(', ');
  return (
    <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
      <div className="absolute inset-[24%] rounded-full bg-white" />
    </div>
  );
}

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示） */
function basicInfoOf(s: AnonymizedStudent): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = [];
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId' || k === 'reviewStatus') continue; // 审核状态由徽章/饼图呈现
    const v = s[k];
    if (v == null || v === '') continue;
    out.push({ key: k, label: STUDENT_FIELD_LABELS[k], value: String(v) });
  }
  return out;
}

/**
 * 单字段常识/单位校验（规则与脱敏阶段共享，见 numeric-validation.ts）。
 * 返回统一提示文案「疑似填写错误待核实」，无异常返回 null。
 */
export function fieldAnomalyOf(key: string, v: string, s: AnonymizedStudent): string | null {
  return checkNumericIssues(s).some((i) => i.key === key && i.value === v) ? NUMERIC_ERROR_LABEL : null;
}

const IMPORTANCE_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' };

/** 图标 + 标题 + 正文的文本卡片（浅底、左侧色条） */
function TextCard({ icon, title, text, accent }: {
  icon: string; title: string; text: string; accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h4 className={`flex items-center gap-1.5 border-l-4 ${accent} pl-2 text-xs font-semibold text-slate-700`}>
        <span aria-hidden="true">{icon}</span> {title}
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

function StudentSection({ g, local }: {
  g: StudentAnalysis;
  local: AnonymizedStudent | undefined;
}) {
  const basics = local ? basicInfoOf(local) : [];
  const highFactors = g.mainDifficultyFactors.filter((f) => f.importance === 'high');
  // 基本情况默认折叠：优先展示家庭情况与材料要点（走访最关注的信息）
  const [showBasics, setShowBasics] = useState(false);
  return (
    <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
      {/* 重点困难概览条：突出 high 因素 */}
      {highFactors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs font-semibold text-amber-800">重点困难</span>
          {highFactors.map((f) => <Badge key={f.factor} tone="amber">{f.factor}</Badge>)}
        </div>
      )}

      <TextCard icon="📝" title="材料要点摘要" accent="border-blue-300" text={g.summary} />
      <TextCard icon="👪" title="家庭情况概括" accent="border-emerald-300" text={g.familySituation} />

      {/* 基本情况：默认折叠，点击展开（两列信息卡，label 左 / value 右） */}
      {basics.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setShowBasics(!showBasics)}
            className="flex w-full items-center justify-between text-left"
          >
            <h4 className="flex items-center gap-1.5 border-l-4 border-slate-300 pl-2 text-xs font-semibold text-slate-700">
              <span aria-hidden="true">📋</span> 基本情况
            </h4>
            <span className="text-xs font-medium text-emerald-700">{showBasics ? '收起' : '展开'}</span>
          </button>
          {showBasics && (
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {basics.map(({ key, label, value }) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dt className="w-24 shrink-0 text-xs text-slate-400">{label}</dt>
                  <dd className="text-xs text-slate-700">
                    {value}
                    {fieldAnomalyOf(key, value, local!) && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">疑似填写错误待核实</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {/* 主要困难因素：每因素独立小卡 */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h4 className="flex items-center gap-1.5 border-l-4 border-amber-300 pl-2 text-xs font-semibold text-slate-700">
          <span aria-hidden="true">⚠️</span> 主要困难因素
        </h4>
        {g.mainDifficultyFactors.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {g.mainDifficultyFactors.map((f) => (
              <div key={f.factor} className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2">
                <Badge tone={IMPORTANCE_TONE[f.importance]}>{IMPORTANCE_LABEL[f.importance]}</Badge>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800">{f.factor}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{f.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">材料中未识别出明显困难因素。</p>
        )}
      </div>

      {/* 需要重点核实：红色醒目卡 */}
      {g.informationToVerify.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h4 className="flex items-center gap-1.5 border-l-4 border-red-400 pl-2 text-xs font-semibold text-red-800">
            <span aria-hidden="true">🔍</span> 需要重点核实
          </h4>
          <ul className="mt-1.5 space-y-1">
            {g.informationToVerify.map((v) => (
              <li key={v} className="flex gap-1.5 text-xs leading-relaxed text-red-800">
                <span aria-hidden="true" className="shrink-0">⚠</span> {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 推荐面谈问题：编号圆点列表 */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h4 className="flex items-center gap-1.5 border-l-4 border-violet-300 pl-2 text-xs font-semibold text-slate-700">
          <span aria-hidden="true">💬</span> 推荐面谈问题
        </h4>
        <ol className="mt-2 space-y-1.5">
          {g.interviewQuestions.map((q, i) => (
            <li key={q} className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                {i + 1}
              </span>
              <span className="text-xs leading-relaxed text-slate-700">{q}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 面谈注意事项：琥珀色提醒卡 */}
      {g.interviewNotes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h4 className="flex items-center gap-1.5 border-l-4 border-amber-400 pl-2 text-xs font-semibold text-amber-800">
            <span aria-hidden="true">📌</span> 面谈注意事项
          </h4>
          <ul className="mt-1.5 space-y-1">
            {g.interviewNotes.map((c) => (
              <li key={c} className="flex gap-1.5 text-xs leading-relaxed text-amber-800">
                <span aria-hidden="true" className="shrink-0">·</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ReportStep({
  report, nameIndex, tokenStats, archived, onDelete, onReset,
}: {
  report: Report;
  nameIndex: Map<string, string>;
  /** 最近一次分析的 token 用量 + 本机累计（仅真实 AI；mock 为 null 不展示） */
  tokenStats: { usage: TokenUsage; cumulative: CumulativeTokenUsage } | null;
  /** 是否从本地存档读取的旧报告（非本次新生成） */
  archived?: boolean;
  /** 提供后底部显示「彻底删除本报告」（从本机浏览器存储永久删除存档） */
  onDelete?: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deleted, setDeleted] = useState(false);
  // 分析完成庆祝动画：弹窗 3.4 秒后淡出，4 秒后卸载（存档读取的历史报告不庆祝）
  const [celebrate, setCelebrate] = useState<'show' | 'leaving' | 'hidden'>(archived ? 'hidden' : 'show');
  // 本地查找的学生信息模态框（studentId）
  const [modalId, setModalId] = useState<string | null>(null);

  useEffect(() => {
    if (archived) return;
    const t1 = setTimeout(() => setCelebrate('leaving'), 3400);
    const t2 = setTimeout(() => setCelebrate('hidden'), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [archived]);

  // 学生搜索计数：输入停顿 800ms 计一次（绝不上报搜索词——搜索词即学生姓名）
  useEffect(() => {
    if (query.trim() === '') return;
    const t = setTimeout(() => reportStudentSearch(APP_VERSION), 800);
    return () => clearTimeout(t);
  }, [query]);

  // 「其他格式」下载菜单开合状态
  const [showMoreFormats, setShowMoreFormats] = useState(false);

  /** 打开学生信息模态框（存在该生才打开） */
  const openStudent = (id: string | null) => {
    if (id && report.students.some((s) => s.studentId === id)) setModalId(id);
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (!window.confirm('彻底删除后不可恢复。确定从本浏览器删除这份报告的存档吗？')) return;
    onDelete();
    setDeleted(true);
  };

  // 本地姓名查找：仅内存匹配（匿名 ID ↔ 姓名），绝不发送
  const matches = useMemo(() => {
    const q = query.trim();
    if (q === '') return [];
    const hits: { id: string; name: string }[] = [];
    for (const [id, name] of nameIndex.entries()) {
      if (name.includes(q)) hits.push({ id, name });
    }
    return hits.slice(0, 10);
  }, [query, nameIndex]);

  const dataById = useMemo(
    () => new Map(report.studentsData.map((s) => [s.anonymousId, s] as const)),
    [report.studentsData],
  );

  const download = () => {
    const md = reportToMarkdown(report, nameIndex);
    const date = report.generatedAt.slice(0, 10);
    downloadTextFile(`走访参考报告-${report.schoolName}-${date}.md`, md, 'text/markdown;charset=utf-8');
    reportReportDownloaded(APP_VERSION, 'markdown');
  };

  const downloadHtml = () => {
    const html = reportToHtml(report, nameIndex);
    const date = report.generatedAt.slice(0, 10);
    downloadTextFile(`走访参考报告-${report.schoolName}-${date}.html`, html, 'text/html;charset=utf-8');
    reportReportDownloaded(APP_VERSION, 'html');
  };

  /**
   * 下载 PDF：浏览器打印桥（纯前端无法静默存 PDF）。
   * 隐藏 iframe 加载报告 HTML → 触发打印框，用户选择「另存为 PDF」即可获得与页面
   * 排版一致的 PDF（含保密页脚；打印样式已强制展开折叠内容）。
   */
  const downloadPdf = () => {
    const html = reportToHtml(report, nameIndex);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    // 等渲染完成后调打印（用户在弹出的打印框里选择「另存为 PDF」）
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 300);
    reportReportDownloaded(APP_VERSION, 'pdf');
  };

  const sa = report.schoolAnalysis;

  // 图表数据（来自本地脱敏数据与 AI 因素结果，非任何外部请求）
  const levelChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of report.studentsData) {
      const lv = s.difficultyLevel;
      if (lv == null || lv === '') continue;
      counts.set(lv, (counts.get(lv) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  }, [report.studentsData]);

  // 困难原因分布（多选拆分统计，学校整体情况饼图用）
  const reasonItems = useMemo(() => countDifficultyReasons(report.studentsData), [report.studentsData]);
  const factorChart = useMemo(() => {
    const counts: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const g of report.students) {
      for (const f of g.mainDifficultyFactors) counts[f.importance] = (counts[f.importance] ?? 0) + 1;
    }
    return ([['high', '高'], ['medium', '中'], ['low', '低']] as const)
      .map(([key, label]) => ({ label, count: counts[key] ?? 0 }))
      .filter((i) => i.count > 0);
  }, [report.students]);

  return (
    <div className="space-y-4">
      {/* 分析成功庆祝浮层：居中弹出 + 绿色光环脉冲，数秒后淡出（不拦截点击） */}
      {celebrate !== 'hidden' && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className={`flex flex-col items-center rounded-2xl bg-white px-10 py-8 shadow-2xl ${celebrate === 'leaving' ? 'animate-fade-out' : 'animate-pop-in'}`}>
            <span className="animate-ring-pulse flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white">✓</span>
            <p className="mt-4 text-lg font-semibold text-slate-800">分析完成！</p>
            <p className="mt-1 text-sm text-slate-500">报告已生成</p>
          </div>
        </div>
      )}

      {/* 分析完成横幅：与检查页明显区分，让用户一眼知道分析已结束 */}
      <div className="flex items-center gap-3 rounded-lg bg-emerald-600 px-4 py-3 text-white shadow">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-base" aria-hidden="true">✓</span>
        <div>
          <p className="text-sm font-semibold">{archived ? '已从本地存档读取报告' : 'AI 分析已完成'}</p>
          <p className="mt-0.5 text-xs text-emerald-100">
            {archived
              ? '该报告保存在本浏览器（仅本机），30 天内未打开查看将自动过期删除。'
              : '以下报告基于脱敏材料生成，仅供走访参考，不构成任何资助结论。'}
          </p>
        </div>
      </div>

      {/* 报告开始前的警示（橙色参考说明 + 红色保密提示） */}
      <div className="space-y-2">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium leading-relaxed text-amber-800">
          ⚠ 本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论；
          最终资格判断由工作人员根据申请材料、现场面谈与学校情况综合决定。
        </div>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-xs font-medium leading-relaxed text-red-800">
          🚫 报告含学生个人信息，严禁外传、截图转发或用于走访工作以外的任何用途，使用后请妥善保存或删除。
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              走访参考报告 — {report.schoolName}（{report.cohort}）
            </h2>
            <p className="mt-1 text-xs text-slate-500">生成时间：{report.generatedAt} · 仅存于当前页面内存</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span title="与页面排版一致，手机/电脑直接打开，离线可用">
                <Button onClick={downloadHtml}>⬇ 下载报告（HTML，推荐）</Button>
              </span>
              {/* 其他格式：PDF / Markdown 收进二级菜单 */}
              <div className="relative">
                <Button variant="secondary" onClick={() => setShowMoreFormats(!showMoreFormats)}>
                  其他格式 ▾
                </Button>
                {showMoreFormats && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMoreFormats(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => { setShowMoreFormats(false); downloadPdf(); }}
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-emerald-50"
                      >
                        下载 PDF
                        <span className="text-[10px] text-slate-400">打印版 · 每生一页</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowMoreFormats(false); download(); }}
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-emerald-50"
                      >
                        Markdown 纯文本
                        <span className="text-[10px] text-slate-400">复制到笔记</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              <Button variant="secondary" onClick={onReset}>开始新的分析</Button>
            </div>
          </div>
        </div>
        {/* token 用量统计（仅真实 AI）：本次调用 + 本机累计，便于统计 API 消耗 */}
        {tokenStats && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="font-medium text-slate-600">本次 AI 调用用量</p>
                <ul className="mt-1.5 space-y-0.5 text-slate-500">
                  <li>· API 调用：{fmt(tokenStats.usage.apiCalls)} 次</li>
                  <li>· 输入（提示词 + 匿名数据）：{fmt(tokenStats.usage.promptTokens)} tokens</li>
                  <li>· 输出（生成报告）：{fmt(tokenStats.usage.completionTokens)} tokens</li>
                  {tokenStats.usage.cacheHitTokens > 0 && (
                    <li>· 其中输入缓存命中：{fmt(tokenStats.usage.cacheHitTokens)} tokens</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="font-medium text-slate-600">本机累计（仅存于本浏览器）</p>
                <ul className="mt-1.5 space-y-0.5 text-slate-500">
                  <li>· 累计分析：{fmt(tokenStats.cumulative.analyses)} 次</li>
                  <li>· 累计输入：{fmt(tokenStats.cumulative.promptTokens)} tokens</li>
                  <li>· 累计输出：{fmt(tokenStats.cumulative.completionTokens)} tokens</li>
                  {tokenStats.cumulative.firstRecordedAt && (
                    <li>· 首次记录于：{tokenStats.cumulative.firstRecordedAt.slice(0, 10)}</li>
                  )}
                </ul>
              </div>
            </div>
            <p className="mt-2 text-slate-400">仅统计 token 计数数字，不存储、不上传任何学生数据。</p>
          </div>
        )}
        {nameIndex.size > 0 && (
          <p className="mt-2 text-xs text-slate-400">下载文件含学生姓名，请妥善保管。</p>
        )}
        {nameIndex.size === 0 && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            未识别到姓名列，列表按匿名编号显示。如需显示学生姓名，请确认表格包含「珍珠生姓名/姓名/学生姓名」列后重新导入。
          </div>
        )}
        {/* 本地查找：输入姓名（仅本机内存匹配）实时下拉 + 查看按钮弹出学生信息模态框 */}
        {nameIndex.size > 0 && (
          <div className="mt-4">
            <label className="text-sm text-slate-600">面谈时快速定位学生（本地查找，姓名仅在本机匹配）：</label>
            <div className="relative mt-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入学生姓名的一部分…"
                  className="w-56 shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={matches.length === 0}
                  onClick={() => openStudent(matches[0]?.id ?? null)}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  查看
                </button>
              </div>
              {/* 实时下拉搜索结果（输入即显示，匹配姓名以列表形式展示） */}
              {query.trim() !== '' && (
                <ul role="listbox" className="animate-slide-down absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {matches.length === 0 && (
                    <li className="px-3 py-2 text-xs text-slate-400">未找到匹配的学生</li>
                  )}
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => openStudent(m.id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-emerald-50"
                      >
                        <span>{m.name}</span>
                        <span className="text-xs text-slate-400">{m.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">一、学校整体情况</h3>
        <p className="mt-2 text-sm text-slate-700">{sa.overview}</p>
        {(levelChart.length > 0 || factorChart.length > 0) && (
          <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
            {levelChart.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">困难类型分布</p>
                <div className="mt-2"><MiniBarChart items={levelChart} color="bg-emerald-500" /></div>
              </div>
            )}
            {factorChart.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">困难因素重要性分布</p>
                <div className="mt-2"><MiniBarChart items={factorChart} color="bg-amber-400" /></div>
              </div>
            )}
          </div>
        )}
        {/* 困难原因分布（申请材料「困难原因」字段，多选拆分统计） */}
        {reasonItems.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-lg bg-slate-50 p-4">
            <div>
              <p className="text-xs font-medium text-slate-500">困难原因分布</p>
              <div className="mt-2"><DonutChart items={reasonItems} /></div>
            </div>
            <ul className="space-y-1">
              {reasonItems.map((i) => (
                <li key={i.label} className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: REVIEW_STATUS_COLORS[reasonItems.indexOf(i) % REVIEW_STATUS_COLORS.length] }} />
                  <span>{i.label}</span>
                  <span className="w-9 text-right font-medium">{i.count} 人</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sa.difficultyPatterns.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">AI 归纳的困难类型</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sa.difficultyPatterns.map((p) => <Badge key={p} tone="slate">{p}</Badge>)}
            </div>
          </div>
        )}
        <section className="mt-4">
          <h4 className="border-l-4 border-slate-400 pl-2 text-sm font-medium text-slate-700">共性问题</h4>
          <ul className="mt-1.5 space-y-0.5 text-sm text-slate-600">
            {sa.commonIssues.map((i) => <li key={i}>· {i}</li>)}
            {sa.commonIssues.length === 0 && <li className="text-xs text-slate-400">暂无。</li>}
          </ul>
        </section>
        <section className="mt-3 rounded bg-amber-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="border-l-4 border-amber-400 pl-2 text-sm font-medium text-amber-800">材料质量提示</h4>
            <button
              type="button"
              onClick={() => exportIssuesCsv(report.schoolName, nameIndex, report.studentsData, report.cleanIssues ?? [])}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
              title="数字校验与敏感误填问题合并导出为表格（含学生姓名，请妥善保管）"
            >
              导出填写问题表（CSV）
            </button>
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-amber-700">
            {sa.dataQualityIssues.map((i) => <li key={i}>· {i}</li>)}
          </ul>
          <p className="mt-1 text-[11px] text-slate-400">
            导出表包含本地数字校验与敏感误填问题（编号/姓名/疑似错误的点/正确应该什么样），与 AI 提示互补。
          </p>
        </section>
        <section className="mt-4">
          <h4 className="border-l-4 border-blue-400 pl-2 text-sm font-medium text-slate-700">重点核实主题</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sa.keyVerificationTopics.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
            {sa.keyVerificationTopics.length === 0 && <span className="text-xs text-slate-400">暂无。</span>}
          </div>
        </section>
      </Card>

      {/* 审核与走访概览：状态饼图（快照口径）+ 审核安排（来源：9/2 早班车，以 H 中心为准） */}
      {(() => {
        const statusCounts = countReviewStatuses(report.studentsData);
        if (statusCounts.length === 0 && !report.audit) return null;
        return (
          <Card>
            <h3 className="text-base font-semibold text-slate-800">审核与走访概览</h3>
            {statusCounts.length > 0 && (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-600">
                      本批次共 <b>{report.studentsData.length}</b> 名学生 · 已标注审核状态 {statusCounts.reduce((a, i) => a + i.count, 0)} 人
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5">
                    <DonutChart items={statusCounts.map((i) => ({ label: i.status, count: i.count }))} />
                    <ul className="space-y-1.5">
                      {statusCounts.map((i) => (
                        <li key={i.status} className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
                          <Badge tone={reviewStatusTone(i.status)}>{i.status}</Badge>
                          <span className="w-9 text-right font-medium">{i.count} 人</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="mt-3 rounded-md bg-slate-50 px-3 py-1.5 text-xs leading-relaxed text-slate-500">
                  注：上表状态取自导入表格时的数据快照，并非实时状态；若名单已在系统中流转（草稿→初审→复审等），
                  请以基金会的实时审核记录为准，走访时建议一并确认当前状态。
                </p>
              </>
            )}
            {/* 审核与走访安排 */}
            {report.audit && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700">
                  审核人：{report.audit.auditor}
                  <span className="mx-2 text-slate-300">·</span>
                  走访人：{report.audit.visitor1}{report.audit.visitor2 ? ` / ${report.audit.visitor2}` : ''}
                </p>
                <p className="mt-1 text-slate-400">
                  以上审核与走访安排来源于 2026 年 9 月 2 日早班车安排，仅供参考；最新安排请咨询 H 中心。
                </p>
              </div>
            )}
          </Card>
        );
      })()}

      {/* 资料填写问题（发送前自动清除的敏感误填；需走访时向学生核实） */}
      {report.cleanIssues && report.cleanIssues.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
          <h3 className="text-sm font-semibold text-amber-800">
            资料填写问题（{report.cleanIssues.length} 处，已自动清除敏感信息）
          </h3>
          <p className="mt-1 text-xs text-amber-700/80">
            以下字段疑似误填了证件号/电话等敏感信息，发送给 AI 的内容已不含原文；走访时请向学生核实真实内容。
          </p>
          <ul className="mt-2 space-y-1">
            {report.cleanIssues.map((c) => (
              <li key={`${c.studentId}-${c.fieldLabel}-${c.originalMasked}`} className="flex flex-wrap items-center gap-1.5 text-xs text-amber-800">
                <span className="font-medium">{nameIndex.get(c.studentId) ?? c.studentId}</span>
                <span className="text-amber-700">
                  · {c.fieldLabel} 原填 {c.originalMasked}，{c.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <h3 className="text-base font-semibold text-slate-800">二、单个学生面谈参考</h3>
        <div className="mt-3 space-y-2">
          {report.students.map((g) => (
            <div key={g.studentId} className="rounded border border-slate-200">
              <button
                type="button"
                onClick={() => setOpen(open === g.studentId ? null : g.studentId)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {nameIndex.get(g.studentId) ?? g.studentId}
                  <span className="text-xs font-normal text-slate-400">{g.studentId}</span>
                  {(() => {
                    const rs = dataById.get(g.studentId)?.reviewStatus?.trim();
                    return rs ? <Badge tone={reviewStatusTone(rs)}>{rs}</Badge> : null;
                  })()}
                  <Badge tone="green">{g.mainDifficultyFactors.filter((f) => f.importance === 'high').length} high</Badge>
                </span>
                <span className="text-xs text-slate-400">{open === g.studentId ? '收起' : '展开'}</span>
              </button>
              {open === g.studentId && (
                <StudentSection
                  g={g}
                  local={dataById.get(g.studentId)}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 彻底删除本报告（本地存档管理） */}
      {onDelete && (
        <div className="rounded-lg border border-red-100 bg-red-50/60 px-4 py-3 text-center">
          {deleted ? (
            <p className="text-sm text-emerald-700">✓ 已从本浏览器彻底删除这份报告的存档（当前页面仍可查看）。</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">本报告已自动存档到本浏览器（含学生姓名，仅本机使用）。</p>
              <button
                type="button"
                onClick={handleDelete}
                className="mt-2 text-sm font-medium text-red-600 hover:text-red-800 hover:underline"
              >
                彻底删除本报告
              </button>
            </>
          )}
        </div>
      )}

      {/* 学生信息模态框（本地查找查看按钮 / 下拉条目触发） */}
      {modalId && report.students.some((s) => s.studentId === modalId) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setModalId(null)}
        >
          <div
            className="animate-pop-in max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                {nameIndex.get(modalId) ?? modalId}
                <span className="text-xs font-normal text-slate-400">{modalId}</span>
                {(() => {
                  const rs = dataById.get(modalId)?.reviewStatus?.trim();
                  return rs ? <Badge tone={reviewStatusTone(rs)}>{rs}</Badge> : null;
                })()}
              </p>
              <button
                type="button"
                onClick={() => setModalId(null)}
                aria-label="关闭"
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <StudentSection
              g={report.students.find((s) => s.studentId === modalId)!}
              local={dataById.get(modalId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

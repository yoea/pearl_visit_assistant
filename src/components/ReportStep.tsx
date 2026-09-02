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

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示） */
function basicInfoOf(s: AnonymizedStudent): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = [];
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId') continue;
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
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              走访参考报告 — {report.schoolName}（{report.cohort}）
            </h2>
            <p className="mt-1 text-xs text-slate-500">生成时间：{report.generatedAt} · 仅存于当前页面内存</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}>下载 Markdown</Button>
            <Button onClick={downloadHtml}>下载单文件 HTML</Button>
            <Button variant="secondary" onClick={onReset}>开始新的分析</Button>
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
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。
          最终资格判断由工作人员根据申请材料、现场面谈与学校情况综合决定。
        </div>
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
        {sa.dataQualityIssues.length > 0 && (
          <section className="mt-3 rounded bg-amber-50 p-3">
            <h4 className="border-l-4 border-amber-400 pl-2 text-sm font-medium text-amber-800">材料质量提示</h4>
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-700">
              {sa.dataQualityIssues.map((i) => <li key={i}>· {i}</li>)}
            </ul>
          </section>
        )}
        <section className="mt-4">
          <h4 className="border-l-4 border-blue-400 pl-2 text-sm font-medium text-slate-700">重点核实主题</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sa.keyVerificationTopics.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
            {sa.keyVerificationTopics.length === 0 && <span className="text-xs text-slate-400">暂无。</span>}
          </div>
        </section>
        <section className="mt-4">
          <h4 className="border-l-4 border-emerald-400 pl-2 text-sm font-medium text-slate-700">整体面谈建议</h4>
          <ul className="mt-1.5 space-y-0.5 text-sm text-slate-600">
            {sa.interviewSuggestions.map((s) => <li key={s}>· {s}</li>)}
            {sa.interviewSuggestions.length === 0 && <li className="text-xs text-slate-400">暂无。</li>}
          </ul>
        </section>
      </Card>

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
                <span className="flex items-center gap-2">
                  {nameIndex.get(g.studentId) ?? g.studentId}
                  <span className="text-xs font-normal text-slate-400">{g.studentId}</span>
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
              <p className="text-sm font-semibold text-slate-800">
                {nameIndex.get(modalId) ?? modalId}
                <span className="ml-2 text-xs font-normal text-slate-400">{modalId}</span>
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

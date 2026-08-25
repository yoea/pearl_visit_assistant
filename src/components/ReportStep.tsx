import { useMemo, useState } from 'react';
import type { Report } from '../report/types';
import type { StudentAnalysis } from '../analysis/provider';
import type { AnonymizedStudent } from '../types/student';
import { reportToMarkdown } from '../report/markdown';
import { downloadTextFile } from '../utils/download';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';

const IMPORTANCE_TONE: Record<string, string> = { high: 'amber', medium: 'blue', low: 'slate' };

/** 本地学生数据 → 基本信息行（null/空串过滤，anonymousId 不展示） */
function basicInfoOf(s: AnonymizedStudent): [string, string][] {
  const out: [string, string][] = [];
  for (const k of Object.keys(STUDENT_FIELD_LABELS) as (keyof AnonymizedStudent)[]) {
    if (k === 'anonymousId') continue;
    const v = s[k];
    if (v == null || v === '') continue;
    out.push([STUDENT_FIELD_LABELS[k], String(v)]);
  }
  return out;
}

function StudentSection({ g, local }: {
  g: StudentAnalysis;
  local: AnonymizedStudent | undefined;
}) {
  const basics = local ? basicInfoOf(local) : [];
  return (
    <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
      {basics.length > 0 && (
        <section>
          <h4 className="font-medium text-slate-700">基本情况</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {basics.map(([label, value]) => <li key={label}>· {label}：{value}</li>)}
          </ul>
        </section>
      )}
      <section>
        <h4 className="font-medium text-slate-700">材料要点摘要</h4>
        <p className="mt-1 text-xs text-slate-600">{g.summary}</p>
      </section>
      <section>
        <h4 className="font-medium text-slate-700">家庭情况概括</h4>
        <p className="mt-1 text-xs text-slate-600">{g.familySituation}</p>
      </section>
      <section>
        <h4 className="font-medium text-slate-700">主要困难因素</h4>
        {g.mainDifficultyFactors.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {g.mainDifficultyFactors.map((f) => (
              <li key={f.factor} className="flex flex-wrap items-center gap-2">
                <Badge tone={IMPORTANCE_TONE[f.importance]}>{f.importance}</Badge>
                <span className="font-medium">{f.factor}</span>
                <span className="text-slate-500">{f.evidence}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-400">材料中未识别出明显困难因素。</p>
        )}
      </section>
      {g.informationToVerify.length > 0 && (
        <section>
          <h4 className="font-medium text-amber-700">需要重点核实</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {g.informationToVerify.map((v) => <li key={v}>· {v}</li>)}
          </ul>
        </section>
      )}
      <section>
        <h4 className="font-medium text-slate-700">推荐面谈问题</h4>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
          {g.interviewQuestions.map((q) => <li key={q}>{q}</li>)}
        </ol>
      </section>
      {g.interviewNotes.length > 0 && (
        <section>
          <h4 className="font-medium text-amber-700">面谈注意事项</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
            {g.interviewNotes.map((c) => <li key={c}>· {c}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function ReportStep({
  report, nameIndex, onReset,
}: {
  report: Report;
  nameIndex: Map<string, string>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
  };

  const sa = report.schoolAnalysis;

  return (
    <div className="space-y-4">
      {/* 分析完成横幅：与检查页明显区分，让用户一眼知道分析已结束 */}
      <div className="flex items-center gap-3 rounded-lg bg-emerald-600 px-4 py-3 text-white shadow">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-base" aria-hidden="true">✓</span>
        <div>
          <p className="text-sm font-semibold">AI 分析已完成</p>
          <p className="mt-0.5 text-xs text-emerald-100">以下报告基于脱敏材料生成，仅供走访参考，不构成任何资助结论。</p>
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
          <div className="flex gap-2">
            <Button onClick={download}>下载走访参考报告（Markdown）</Button>
            <Button variant="secondary" onClick={onReset}>重新开始</Button>
          </div>
        </div>
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
        {/* 本地查找：输入姓名（仅本机内存匹配）定位到匿名编号 */}
        {nameIndex.size > 0 && (
          <div className="mt-4">
            <label className="text-sm text-slate-600">面谈时快速定位学生（本地查找，姓名仅在本机匹配）：</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入学生姓名的一部分…"
              className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            {matches.length > 0 && (
              <ul className="mt-2 space-y-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(m.id)}
                      className="text-sm text-emerald-700 hover:underline"
                    >
                      {m.id}（{m.name}）
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">一、学校整体情况</h3>
        <p className="mt-2 text-sm text-slate-700">{sa.overview}</p>
        {sa.difficultyPatterns.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">困难类型分布</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sa.difficultyPatterns.map((p) => <Badge key={p} tone="slate">{p}</Badge>)}
            </div>
          </div>
        )}
        <section className="mt-3">
          <h4 className="text-sm font-medium text-slate-700">共性问题</h4>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
            {sa.commonIssues.map((i) => <li key={i}>· {i}</li>)}
            {sa.commonIssues.length === 0 && <li className="text-xs text-slate-400">暂无。</li>}
          </ul>
        </section>
        {sa.dataQualityIssues.length > 0 && (
          <section className="mt-3 rounded bg-amber-50 p-3">
            <h4 className="text-sm font-medium text-amber-800">材料质量提示</h4>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
              {sa.dataQualityIssues.map((i) => <li key={i}>· {i}</li>)}
            </ul>
          </section>
        )}
        <section className="mt-3">
          <h4 className="text-sm font-medium text-slate-700">重点核实主题</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sa.keyVerificationTopics.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
            {sa.keyVerificationTopics.length === 0 && <span className="text-xs text-slate-400">暂无。</span>}
          </div>
        </section>
        <section className="mt-3">
          <h4 className="text-sm font-medium text-slate-700">整体面谈建议</h4>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
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
    </div>
  );
}

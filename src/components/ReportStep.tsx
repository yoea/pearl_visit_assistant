import { useMemo, useState } from 'react';
import type { Report } from '../report/types';
import { reportToMarkdown } from '../report/markdown';
import { downloadTextFile } from '../utils/download';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';

export default function ReportStep({
  report, nameIndex, onReset,
}: {
  report: Report;
  nameIndex: Map<string, string>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // 本地姓名查找：仅内存匹配（anonymousId ↔ 姓名），绝不发送、绝不展示在报告数据中
  const matches = useMemo(() => {
    const q = query.trim();
    if (q === '') return [];
    const hits: { anonymousId: string; name: string }[] = [];
    for (const [id, name] of nameIndex.entries()) {
      if (name.includes(q)) hits.push({ anonymousId: id, name });
    }
    return hits.slice(0, 10);
  }, [query, nameIndex]);

  const download = () => {
    const md = reportToMarkdown(report);
    const date = report.generatedAt.slice(0, 10);
    downloadTextFile(`走访参考报告-${report.schoolName}-${date}.md`, md, 'text/markdown;charset=utf-8');
  };

  const o = report.overview;

  return (
    <div className="space-y-4">
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
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。
          最终资格判断由工作人员根据申请材料、现场面谈与学校情况综合决定。
        </div>
        {/* 本地查找：输入姓名（仅本机内存匹配）定位到匿名编号 */}
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
                <li key={m.anonymousId}>
                  <button
                    type="button"
                    onClick={() => setOpen(m.anonymousId)}
                    className="text-sm text-emerald-700 hover:underline"
                  >
                    {m.anonymousId}（{m.name}）
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">一、学校整体情况</h3>
        <p className="mt-2 text-sm text-slate-700">本校共 {o.studentCount} 名候选学生。</p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['低收入家庭', `${o.lowIncomeCount} 人（${(o.lowIncomeRatio * 100).toFixed(1)}%）`],
            ['重大疾病家庭', `${o.majorIllnessCount} 个`],
            ['单亲/弱劳动能力家庭', `${o.singleParentOrWeakLaborCount} 个`],
            ['高负债家庭', `${o.highDebtCount} 个`],
            ['租房家庭', `${o.rentalCount} 个`],
            ['远距通学（>5km）', `${o.longDistanceCount} 人`],
            ['值得重点关注', `${o.focusStudentIds.length} 名`],
            ['材料平均缺失字段', `${o.completeness.averageMissing.toFixed(1)} / ${o.completeness.totalFields}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-slate-100 pb-1">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500">困难类型分布</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(o.difficultyDistribution).map(([k, v]) => (
              <Badge key={k} tone="slate">{k}：{v} 人</Badge>
            ))}
            {Object.keys(o.difficultyDistribution).length === 0 && <span className="text-xs text-slate-400">未识别</span>}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">二、单个学生面谈参考</h3>
        <div className="mt-3 space-y-2">
          {report.studentGuides.map((g) => (
            <div key={g.anonymousId} className="rounded border border-slate-200">
              <button
                type="button"
                onClick={() => setOpen(open === g.anonymousId ? null : g.anonymousId)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>{g.anonymousId}</span>
                <span className="text-xs text-slate-400">{open === g.anonymousId ? '收起' : '展开'}</span>
              </button>
              {open === g.anonymousId && (
                <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
                  <section>
                    <h4 className="font-medium text-slate-700">基本情况</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {g.basicInfo.map((kv) => <li key={kv.label}>· {kv.label}：{kv.value}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">申请原因概括</h4>
                    <p className="mt-1 text-xs text-slate-600">{g.reasonSummary}</p>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">家庭情况概括</h4>
                    <p className="mt-1 text-xs text-slate-600">{g.familySummary}</p>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">主要困难因素</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {g.difficultyFactors.map((f) => <li key={f.label}>· {f.label}：{f.evidence}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">需要重点核实</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {g.verificationPoints.map((v) => <li key={v}>· {v}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">推荐面谈问题</h4>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                      {g.suggestedQuestions.map((q) => <li key={q}>{q}</li>)}
                    </ol>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">面谈注意事项</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                      {g.cautions.map((c) => <li key={c}>· {c}</li>)}
                    </ul>
                  </section>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

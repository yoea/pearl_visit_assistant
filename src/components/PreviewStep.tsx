import { useState } from 'react';
import type { AnonymizationOutput, AnonymizedStudent } from '../types/student';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import Card from './ui/Card';
import Button from './ui/Button';

const ROW_COLUMNS: (keyof AnonymizedStudent)[] = [
  'anonymousId', 'gender', 'householdType', 'difficultyLevel', 'annualIncome',
  'perCapitaIncome', 'housingStatus', 'debtStatus',
];

export default function PreviewStep({
  output, onNext,
}: {
  output: AnonymizationOutput;
  onNext: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { students } = output;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">匿名数据预览（将发送给 AI）</h2>
      <p className="mt-1 text-sm text-slate-500">
        学生统一显示为匿名编号，不显示真实姓名。点击「展开」查看单个学生的全部分析数据。
      </p>
      <div className="mt-4 max-h-96 overflow-auto rounded border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              {ROW_COLUMNS.map((k) => <th key={k} className="px-3 py-2">{STUDENT_FIELD_LABELS[k]}</th>)}
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => (
              <FragmentRow
                key={s.anonymousId}
                student={s}
                expanded={expanded === s.anonymousId}
                onToggle={() => setExpanded(expanded === s.anonymousId ? null : s.anonymousId)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button onClick={onNext}>进入安全检查</Button>
      </div>
    </Card>
  );
}

function FragmentRow({ student, expanded, onToggle }: {
  student: AnonymizedStudent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="align-top">
        {ROW_COLUMNS.map((k) => (
          <td key={k} className="px-3 py-1.5 text-slate-700">
            {student[k] == null || student[k] === '' ? '—' : String(student[k])}
          </td>
        ))}
        <td className="px-3 py-1.5">
          <button type="button" onClick={onToggle} className="text-xs text-emerald-700 hover:underline">
            {expanded ? '收起' : '展开'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={ROW_COLUMNS.length + 1} className="px-4 py-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {Object.entries(STUDENT_FIELD_LABELS)
                .filter(([k]) => k !== 'anonymousId')
                .map(([k, label]) => {
                  const v = (student as unknown as Record<string, unknown>)[k];
                  return (
                    <div key={k} className="flex gap-2 text-xs">
                      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
                      <dd className="text-slate-700">{v == null || v === '' ? '—' : String(v)}</dd>
                    </div>
                  );
                })}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

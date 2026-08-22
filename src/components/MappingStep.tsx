import type { ParsedState } from '../types/pipeline';
import { ACTION_LABELS, DROP_REASON_LABELS } from '../utils/field-labels';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

const TONE: Record<string, string> = {
  keep: 'green', scrub: 'blue', generalize: 'amber', drop: 'slate',
};

export default function MappingStep({ state, onAnonymize }: { state: ParsedState; onAnonymize: () => void }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">字段映射预览</h2>
      <p className="mt-1 text-sm text-slate-500">
        识别到表头位于第 {state.headerRowIndex} 行。共 {state.rowCount} 名学生、
        {state.fieldCount} 个字段。以下分类仅决定「哪些信息发送给 AI」，原始数据不会被修改或上传。
      </p>
      <div className="mt-4 max-h-96 overflow-auto rounded border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">字段名</th>
              <th className="px-3 py-2">处理方式</th>
              <th className="px-3 py-2">说明</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {state.mappedColumns.map((c) => (
              <tr key={c.header}>
                <td className="px-3 py-1.5">{c.header}</td>
                <td className="px-3 py-1.5">
                  <Badge tone={TONE[c.action.action] ?? 'slate'}>
                    {c.action.action === 'drop'
                      ? `${ACTION_LABELS.drop}（${DROP_REASON_LABELS[c.action.reason] ?? '未知'}）`
                      : ACTION_LABELS[c.action.action]}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-500">
                  {c.action.action === 'keep' && '原样发送给 AI'}
                  {c.action.action === 'scrub' && '发送前清除文本中内嵌的姓名/电话/地址'}
                  {c.action.action === 'generalize' && '全校排名 → 比例区间（降低识别风险）'}
                  {c.action.action === 'drop' && '不会发送给 AI'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button onClick={onAnonymize}>开始本地脱敏</Button>
      </div>
    </Card>
  );
}

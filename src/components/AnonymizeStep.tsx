import type { AnonymizationOutput } from '../types/student';
import Card from './ui/Card';
import StatCard from './ui/StatCard';
import Button from './ui/Button';

export default function AnonymizeStep({
  output, onNext,
}: {
  output: AnonymizationOutput;
  onNext: () => void;
}) {
  const s = output.stats;
  const checks = [
    '原始姓名未发送', '身份证号未发送', '联系方式未发送', '详细地址未发送',
  ];
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">本地脱敏完成</h2>
      <p className="mt-1 text-sm text-slate-500">
        脱敏仅在当前浏览器内完成。以下为最终发送给 AI 的数据口径统计：
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="原始学生数" value={s.rawStudentCount} />
        <StatCard label="原始字段数" value={s.rawFieldCount} />
        <StatCard label="敏感字段数" value={s.sensitiveFieldCount} />
        <StatCard label="已删除字段数" value={s.droppedFieldCount} />
        <StatCard label="已泛化字段数" value={s.generalizedFieldCount} />
        <StatCard label="最终发送字段数" value={s.sentFieldCount} />
      </div>
      <ul className="mt-4 space-y-1">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-2 text-sm text-emerald-700">
            <span>✓</span> {c}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Button onClick={onNext}>查看匿名数据预览</Button>
      </div>
    </Card>
  );
}

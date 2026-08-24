import type { AnonymizationOutput } from '../types/student';
import Card from './ui/Card';
import Button from './ui/Button';
import CheckItem from './ui/CheckItem';

/** 绝不发送的字段清单（与 field-policies 的删除分类对应；发送侧白名单见 payload.ts SENT_FIELDS） */
const NOT_SENT_ITEMS = [
  '学生姓名', '身份证号', '电话号码', 'QQ', '微信', '邮箱',
  '详细家庭住址', '家访教师/审批人姓名', '珍珠号',
  '原始 Excel 文件本身', '表格中无法识别的未知字段',
];

/**
 * 发送数据预览（scanned 阶段 confirm 视图子态）。
 * 安全红线：本组件挂载本身零网络调用，绝不自动发送——
 * 只有用户点击「确认并开始 AI 分析」才触发 onConfirm（即 App.handleAnalyze）。
 */
export default function SendPreviewStep({
  output, meta, providerName, analyzing, error, onBack, onConfirm,
}: {
  output: AnonymizationOutput;
  meta: { schoolName: string; cohort: string };
  /** 分析模式：'mock'（本地模拟，数据不出本机）| 'deepseek'（真实 AI）——绝不静默假装真实 AI */
  providerName: string;
  analyzing: boolean;
  error?: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">发送数据预览（发送前最终确认）</h2>
      <p className="mt-1 text-sm text-slate-500">
        以下内容将发送至指定分析服务器。发送前已通过三道安全检查；系统不会自动发送，请确认后手动开始。
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-700">将发送内容</p>
        <ul className="mt-2 space-y-1 text-slate-600">
          <li>· 学校名称（脱敏）：{meta.schoolName}</li>
          <li>· 届别：{meta.cohort}</li>
          <li>· 学生人数：{output.students.length} 人</li>
          <li>· 每名学生：34 个已脱敏字段（匿名编号 student-001 起，仅本次会话内存有效）</li>
          <li>
            · 分析模式：{providerName === 'mock'
              ? '本地模拟分析（数据不出本机，不会上传）'
              : '真实 AI 分析（经三道安全检查后发送至分析服务器）'}
          </li>
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-800">以下内容绝不会发送</p>
        <ul className="mt-2">
          {NOT_SENT_ITEMS.map((label) => <CheckItem key={label} label={label} ok />)}
        </ul>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="secondary" onClick={onBack} disabled={analyzing}>返回检查</Button>
        <Button onClick={onConfirm} disabled={analyzing}>
          {analyzing ? 'AI 分析中，请勿关闭页面…' : '确认并开始 AI 分析'}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

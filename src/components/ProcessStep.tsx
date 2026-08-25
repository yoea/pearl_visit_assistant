import { useEffect, useState } from 'react';
import type { SecurityScanResult } from '../security/scanner';
import type { AnonymizationOutput, AnonymizedStudent, MappedColumn } from '../types/student';
import { ACTION_LABELS, DROP_REASON_LABELS, STUDENT_FIELD_LABELS } from '../utils/field-labels';
import { SENT_FIELDS } from '../analysis/payload';
import Card from './ui/Card';
import StatCard from './ui/StatCard';
import Button from './ui/Button';
import Badge from './ui/Badge';
import CheckItem from './ui/CheckItem';

/**
 * 脱敏及检查合并页（anonymized/scanned 阶段）。
 * 安全红线：本组件挂载本身零网络调用，绝不自动发送——
 * 只有用户点击「确认并开始 AI 分析」才触发 onAnalyze（即 App.handleAnalyze）；
 * analyzing 期间按钮禁用；provider 徽标绝不静默假装真实 AI。
 * 布局：检查与确认操作区置顶（按钮随手可点），统计与折叠详情在下方。
 */

/** 绝不发送的字段清单（与 field-policies 的删除分类对应；发送侧白名单见 payload.ts SENT_FIELDS） */
const NOT_SENT_ITEMS = [
  '学生姓名', '身份证号', '电话号码', 'QQ', '微信', '邮箱',
  '详细家庭住址', '家访教师/审批人姓名', '珍珠号',
  '原始 Excel 文件本身', '表格中无法识别的未知字段',
];

const CHECK_LABELS = [
  { key: 'id-card', label: '身份证号' },
  { key: 'mobile', label: '手机号' },
  { key: 'landline', label: '固定电话' },
  { key: 'name-blacklist', label: '姓名' },
  { key: 'name', label: '姓名模式' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信' },
  { key: 'qq', label: 'QQ' },
  { key: 'address', label: '详细地址' },
  { key: 'pearl-id', label: '珍珠号' },
  { key: 'forbidden-field', label: '其他高风险个人身份信息' },
  { key: 'malformed-payload', label: '数据异常' },
] as const;

const ACTION_TONE: Record<string, string> = {
  keep: 'green', scrub: 'blue', generalize: 'amber', drop: 'slate',
};

const ROW_COLUMNS: (keyof AnonymizedStudent)[] = [
  'anonymousId', 'gender', 'householdType', 'difficultyLevel', 'annualIncome',
  'perCapitaIncome', 'housingStatus', 'debtStatus',
];

/** 按学生人数给出粗略预估时长（实测：50 人约 25-30 秒，分批 10 人/批并发 5） */
function estimateDuration(n: number): string {
  if (n <= 10) return '预计 10-20 秒';
  if (n <= 50) return '预计 30 秒至 1 分钟';
  return '预计 1-3 分钟';
}

export default function ProcessStep({
  output, scan, mappedColumns, meta, providerName, analyzing, error, onAnalyze, onReset,
}: {
  output: AnonymizationOutput;
  /** scanned 阶段一定携带扫描结果；anonymized 半态（自动流转的瞬时态）为 undefined，显示防御态 */
  scan: SecurityScanResult | undefined;
  mappedColumns: MappedColumn[];
  meta: { schoolName: string; cohort: string };
  /** 分析模式：'mock'（本地模拟，数据不出本机）| 'deepseek'（真实 AI）——绝不静默假装真实 AI */
  providerName: string;
  analyzing: boolean;
  error?: string;
  onAnalyze: () => void;
  onReset: () => void;
}) {
  const [showMapping, setShowMapping] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showNotSent, setShowNotSent] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const s = output.stats;
  const hitKeys = new Set(scan?.findings.map((f) => f.category) ?? []);

  // 分析中计时：每秒刷新「已等待 X 秒」，分析结束归零
  useEffect(() => {
    if (!analyzing) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, [analyzing]);

  return (
    <div className="space-y-4">
      {/* 置顶操作区：检查结论 + 发送确认，按钮在首屏随手可点。
          分析中仅确认按钮替换为动画反馈，下方统计/映射/预览卡片仍可自由查看。 */}
      <Card>
        <h2 className="text-lg font-semibold text-slate-800">发送前检查与确认</h2>
        <p className="mt-1 text-sm text-slate-500">
          在调用 AI 之前，对最终发送数据（共 {output.students.length} 名学生的匿名数据）再做一次敏感信息扫描。
          如发现疑似敏感信息将阻止发送，且不允许绕过。系统不会自动发送，请确认后手动开始。
        </p>

        {!scan && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">正在处理…</p>
            <div className="mt-4">
              <Button variant="secondary" onClick={onReset}>重新开始</Button>
            </div>
          </div>
        )}

        {scan && !scan.passed && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              ✗ 发现疑似敏感信息，已阻止发送。请重新导入并检查源文件后重试。
            </p>
            <ul className="mt-3 space-y-1">
              {CHECK_LABELS.map((c) => (
                <CheckItem
                  key={c.key}
                  label={c.label}
                  ok={!hitKeys.has(c.key)}
                  detail={
                    hitKeys.has(c.key)
                      ? scan.findings
                          .filter((f) => f.category === c.key)
                          .map((f) => `${f.field}: ${f.snippet}`)
                          .join('；')
                      : undefined
                  }
                />
              ))}
            </ul>
            <div className="mt-4">
              <Button variant="secondary" onClick={onReset}>重新开始</Button>
            </div>
          </div>
        )}

        {/* 扫描通过：绿色摘要 + 发送摘要 + 确认按钮（唯一分析入口，绝不自动发送） */}
        {scan?.passed && (
          <>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-800">✓ 未发现禁止发送的个人身份信息，可以开始分析</p>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-medium text-slate-700">将发送内容</p>
              <ul className="mt-2 space-y-1 text-slate-600">
                <li>· 学校名称（脱敏）：{meta.schoolName}</li>
                <li>· 届别：{meta.cohort}</li>
                <li>· 学生人数：{output.students.length} 人</li>
                <li>· 每名学生：{SENT_FIELDS.length} 个已脱敏字段（匿名编号 student-001 起，仅本次会话内存有效）</li>
                <li>
                  · 分析模式：{providerName === 'mock'
                    ? '本地模拟分析（数据不出本机，不会上传）'
                    : '真实 AI 分析（经三道安全检查后直接发送至 DeepSeek）'}
                </li>
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {analyzing ? (
                <div className="flex w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <span
                    className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-emerald-800">
                      AI 正在分析 {output.students.length} 名学生，请勿关闭页面…
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600">
                      {estimateDuration(output.students.length)} · 已等待 {elapsed} 秒
                    </p>
                  </div>
                </div>
              ) : (
                <Button onClick={onAnalyze}>确认并开始 AI 分析</Button>
              )}
              <Button variant="secondary" onClick={onReset} disabled={analyzing}>重新开始</Button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {/* 绝不发送清单（默认收起，避免顶部长卡把按钮推远） */}
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-800">以下内容绝不会发送</p>
                <button
                  type="button"
                  onClick={() => setShowNotSent(!showNotSent)}
                  className="text-xs text-emerald-700 hover:underline"
                >
                  {showNotSent ? '收起' : '查看绝不发送清单'}
                </button>
              </div>
              {showNotSent && (
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {NOT_SENT_ITEMS.map((label) => <CheckItem key={label} label={label} ok />)}
                </ul>
              )}
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-800">本地脱敏统计</h2>
        <p className="mt-1 text-sm text-slate-500">
          脱敏已在浏览器内自动完成。以下为最终发送给 AI 的数据口径统计：
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
          {['原始姓名未发送', '身份证号未发送', '联系方式未发送', '详细地址未发送'].map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm text-emerald-700">
              <span>✓</span> {c}
            </li>
          ))}
        </ul>
      </Card>

      {/* 字段映射摘要（默认折叠） */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">字段映射详情</h3>
          <button
            type="button"
            onClick={() => setShowMapping(!showMapping)}
            className="text-xs text-emerald-700 hover:underline"
          >
            {showMapping ? '收起' : '展开'}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          以下分类仅决定「哪些信息发送给 AI」，原始数据不会被修改或上传。
        </p>
        {showMapping && (
          <div className="mt-3 max-h-96 overflow-auto rounded border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">字段名</th>
                  <th className="px-3 py-2">处理方式</th>
                  <th className="px-3 py-2">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappedColumns.map((c) => (
                  <tr key={c.header}>
                    <td className="px-3 py-1.5">{c.header}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={ACTION_TONE[c.action.action] ?? 'slate'}>
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
        )}
      </Card>

      {/* 匿名数据预览（默认折叠） */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">匿名数据预览（将发送给 AI）</h3>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-emerald-700 hover:underline"
          >
            {showPreview ? '收起' : '展开'}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          学生统一显示为匿名编号，不显示真实姓名。点击「展开」查看单个学生的全部分析数据。
        </p>
        {showPreview && (
          <div className="mt-3 max-h-96 overflow-auto rounded border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  {ROW_COLUMNS.map((k) => <th key={k} className="px-3 py-2">{STUDENT_FIELD_LABELS[k]}</th>)}
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {output.students.map((stu) => (
                  <FragmentRow
                    key={stu.anonymousId}
                    student={stu}
                    expanded={expanded === stu.anonymousId}
                    onToggle={() => setExpanded(expanded === stu.anonymousId ? null : stu.anonymousId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
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

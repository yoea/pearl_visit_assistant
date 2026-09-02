import { useRef, useState, type DragEvent } from 'react';
import { APP_SUBTITLE, APP_TITLE } from '../app-config';

/**
 * 首页（导入步）：Hero 区 + 大上传区 + 功能亮点 + 可视化使用流程。
 * 安全红线不变：本组件零网络调用，文件只在浏览器本地读取处理。
 */

/** Hero 区短标签（与下方功能卡不重复，只做关键词点缀） */
const BADGES = [
  { icon: '🔒', label: '隐私优先' },
  { icon: '🛡️', label: '安全检查' },
  { icon: '🤖', label: 'AI 分析' },
  { icon: '📥', label: '本地存档' },
];

/** 功能亮点卡（完整标题 + 说明） */
const HIGHLIGHTS = [
  { icon: '🔒', title: '数据不出本机', desc: '原始学生信息仅在浏览器内处理，不上传、不存储' },
  { icon: '🛡️', title: '三道安全检查', desc: '发送前强制扫描，发现疑似敏感信息自动阻止' },
  { icon: '🤖', title: 'AI 智能分析', desc: '自动提取重点信息与资料填写问题，生成面谈参考' },
  { icon: '📥', title: '报告本地存档', desc: '报告自动存档 30 天，随时查看、删除，重复使用' },
];

const STEPS = [
  { title: '上传 Excel', desc: '拖入学生申请名单，自动识别字段' },
  { title: '自动脱敏检查', desc: '敏感信息本地自动清洗，无需手工处理' },
  { title: 'AI 分析', desc: '确认后开始分析，通常 1 分钟内完成' },
  { title: '查看与下载', desc: '报告卡片化展示，可存档、可下载' },
];

export default function ImportStep({
  onFile, error,
}: {
  onFile: (buffer: ArrayBuffer) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      alert('请选择 .xlsx 或 .xls 文件');
      return;
    }
    const buffer = await file.arrayBuffer();
    onFile(buffer);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  return (
    <div className="space-y-6">
      {/* Hero 区：标题 + 功能说明 + 亮点徽章 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 px-6 py-8 text-white shadow-lg">
        <h1 className="text-2xl font-bold tracking-wide">{APP_TITLE}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50">{APP_SUBTITLE}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {BADGES.map((b) => (
            <span
              key={b.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm"
            >
              <span aria-hidden="true">{b.icon}</span> {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* 上传区 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all ${
            dragging
              ? 'scale-[1.01] border-emerald-500 bg-emerald-50'
              : 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-500 hover:bg-emerald-50'
          }`}
        >
          <span className="text-5xl" aria-hidden="true">📤</span>
          <p className="mt-4 text-base font-semibold text-slate-800">点击选择，或将 Excel 拖拽到此处</p>
          <p className="mt-1 text-sm text-slate-500">
            支持 .xlsx / .xls（如「2026级珍珠生候选申请名单.xlsx」）
          </p>
          <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
            <span aria-hidden="true">🔒</span> 文件仅在您的浏览器本地处理，不会上传到任何服务器
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {/* 功能亮点 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl" aria-hidden="true">
              {h.icon}
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-800">{h.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{h.desc}</p>
          </div>
        ))}
      </div>

      {/* 使用流程 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">只需 4 步，生成走访参考报告</h2>
        <ol className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-1 items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <span className="hidden shrink-0 text-slate-300 sm:block" aria-hidden="true">→</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

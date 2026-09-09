import { useRef, useState, type DragEvent } from 'react';
import { APP_SUBTITLE, APP_TITLE } from '../app-config';
import { parseExcel } from '../excel/excel-parser';

/**
 * 首页（导入步）：支持一次选择/拖入多份 Excel，但限定为同一所学校的学生名单。
 * 选择即本地解析并立即显示所选学校；跨学校的文件当场红条提示并忽略，
 * 且出现提示期间「分析」按钮锁定（需点击「知道了」确认后恢复）。
 * 安全红线不变：本组件零网络调用，文件只在浏览器本地读取处理。
 */

const BADGES = [
  { icon: '🔒', label: '隐私优先' },
  { icon: '🛡️', label: '安全检查' },
  { icon: '🤖', label: 'AI 分析' },
  { icon: '📥', label: '本地存档' },
];

/** Hero 区下方功能卡（完整标题 + 说明） */
const HIGHLIGHTS = [
  { icon: '🔒', title: '数据不出本机', desc: '原始学生信息仅在浏览器内处理，不上传、不存储' },
  { icon: '🛡️', title: '三道安全检查', desc: '发送前强制扫描，发现疑似敏感信息自动阻止' },
  { icon: '🤖', title: 'AI 智能分析', desc: '自动提取重点信息与资料填写问题，生成面谈参考' },
  { icon: '📥', title: '报告本地存档', desc: '报告自动存档 30 天，随时查看、删除，重复使用' },
];

const STEPS = [
  { title: '上传 Excel', desc: '可多份同校名单一起上传，自动合并' },
  { title: '自动脱敏检查', desc: '敏感信息本地自动清洗，数字校验提前提示疑点' },
  { title: 'AI 分析', desc: '确认后开始，通常 1 分钟内完成' },
  { title: '查看与下载', desc: '报告卡片化展示，可存档、可下载' },
];

interface QueuedFile {
  id: string;
  file: File;
  schoolName: string;
}

let uidSeq = 0;
const uid = () => `f${Date.now().toString(36)}-${(uidSeq += 1)}`;

/** 学校名比较用归一化：去空白（含全角空格） */
function normSchool(s: string): string {
  return s.replace(/[\s　]/g, '');
}

export default function ImportStep({
  onFiles, error,
}: {
  /** 提交待分析的文件列表（同校多份；跨校文件已在选择时被拦截提示） */
  onFiles: (files: File[]) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  /** 选文件过程中的即时提示（跨校/解析失败等）；出现期间分析按钮锁定 */
  const [notices, setNotices] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const baseSchoolRef = useRef<string | null>(null);

  const baseSchool = queue.length > 0 ? queue[0].schoolName : null;

  /** 校验并加入：选择/拖入即本地解析 → 即时识别学校；跨校/异常当场提示并忽略 */
  const enqueue = async (incoming: File[]) => {
    if (incoming.length === 0) return;
    setParsing(true);
    const fresh: QueuedFile[] = [];
    const newNotices: string[] = [];
    const seen = new Set(queue.map((q) => q.file.name));
    for (const f of incoming) {
      if (!/\.(xlsx|xls)$/i.test(f.name)) continue;
      if (seen.has(f.name)) continue; // 同名重复选择忽略
      seen.add(f.name);

      let school: string | null = null;
      let problem: string | null = null;
      try {
        const parsed = await parseExcel(await f.arrayBuffer());
        school = parsed.schoolName ? parsed.schoolName.trim() : null;
        if (!school) problem = '未识别到「学校名称」列，无法确认学校归属';
      } catch (e) {
        problem = `解析失败：${e instanceof Error ? e.message : '文件格式错误'}`;
      }

      if (problem) {
        newNotices.push(`「${f.name}」${problem}，已忽略该文件。`);
        continue;
      }
      const base = baseSchoolRef.current;
      if (base === null) {
        // 首份：成为基座学校
        baseSchoolRef.current = school;
        fresh.push({ id: uid(), file: f, schoolName: school! });
        continue;
      }
      if (normSchool(school!) !== normSchool(base)) {
        newNotices.push(`「${f.name}」属于「${school}」，与已选学校「${base}」不是同一所学校。一次只能分析同一所学校，已忽略该文件。`);
        continue;
      }
      fresh.push({ id: uid(), file: f, schoolName: school! });
    }
    if (fresh.length > 0) setQueue((prev) => [...prev, ...fresh]);
    if (newNotices.length > 0) setNotices((prev) => [...prev, ...newNotices]);
    setParsing(false);
  };

  const removeFile = (id: string) => {
    setQueue((prev) => {
      const next = prev.filter((q) => q.id !== id);
      if (prev.length > 0 && next.length === 0) baseSchoolRef.current = null;
      return next;
    });
  };

  const clearAll = () => {
    setQueue([]);
    baseSchoolRef.current = null;
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) void enqueue(Array.from(files));
  };

  const onPick = (files: FileList | null) => {
    if (files && files.length > 0) void enqueue(Array.from(files));
  };

  // 有即时提示时锁定「分析」按钮：用户需先点「知道了」确认提示
  const locked = notices.length > 0;
  const fileCount = queue.length;

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

      {/* 上传区（多文件队列，选择即识别学校） */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !parsing && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all ${
            dragging
              ? 'scale-[1.01] border-emerald-500 bg-emerald-50'
              : 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-500 hover:bg-emerald-50'
          }`}
        >
          <span className="text-5xl" aria-hidden="true">📤</span>
          <p className="mt-4 text-base font-semibold text-slate-800">
            {parsing
              ? '正在读取表格，请稍候…'
              : queue.length > 0
                ? '继续添加，或拖入更多表格'
                : '点击选择，或将 Excel 拖拽到此处'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            支持 .xlsx / .xls · 可一次选择多份，但须为<b>同一所学校</b>的学生名单（将合并分析生成一份报告）
          </p>
          <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
            <span aria-hidden="true">🔒</span> 文件仅在您的浏览器本地处理，不会上传到任何服务器
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* 即时提示：跨校 / 解析失败（出现期间锁定分析按钮） */}
        {notices.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-red-800">
              <span aria-hidden="true">⚠</span> 以下表格未加入队列：
            </p>
            <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-red-700">
              {notices.map((n) => <li key={n}>· {n}</li>)}
            </ul>
            <button
              type="button"
              onClick={() => setNotices([])}
              className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              知道了，继续分析已选表格
            </button>
          </div>
        )}

        {/* 已选文件队列（立即显示所选学校） */}
        {queue.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                {baseSchool && (
                  <>
                    <span className="text-xs text-slate-400">所选学校：</span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      {baseSchool}
                    </span>
                  </>
                )}
                <span className="text-xs font-normal text-slate-400">（{fileCount} 份表格）</span>
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-slate-400 underline-offset-2 transition-colors hover:text-slate-600 hover:underline"
              >
                清空列表
              </button>
            </div>
            <ul className="mt-2 space-y-1.5">
              {queue.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-slate-700">
                  <span className="min-w-0 truncate">📄 {q.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(q.id)}
                    className="shrink-0 rounded px-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
                    title="移除该文件"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm leading-relaxed text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={fileCount === 0 || locked || parsing}
            onClick={() => { if (fileCount > 0 && !locked) onFiles(queue.map((q) => q.file)); }}
            className="rounded-md bg-emerald-700 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {locked ? '请先处理上方提示' : fileCount > 0 ? `分析这 ${fileCount} 份表格` : '分析表格'}
          </button>
          <p className="text-xs text-slate-400">
            同一学校多份名单将合并为一份报告；不同学校的表格会在选择时提示并忽略。
          </p>
        </div>
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

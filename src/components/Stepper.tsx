const STEPS = ['导入Excel', '脱敏及检查', 'AI分析报告'];

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const state = idx < current ? 'done' : idx === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                state === 'done'
                  ? 'bg-emerald-600 text-white'
                  : state === 'active'
                    ? 'bg-emerald-700 text-white ring-2 ring-emerald-200'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {state === 'done' ? '✓' : idx}
            </span>
            <span className={state === 'todo' ? 'text-slate-400' : 'text-slate-700'}>{label}</span>
            {idx < STEPS.length - 1 && <span className="text-slate-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

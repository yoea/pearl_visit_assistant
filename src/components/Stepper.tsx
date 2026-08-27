const STEPS = ['导入Excel', '脱敏及检查', 'AI分析报告'];

/**
 * 步骤条：current 为当前步骤（1-3）。
 * 传入 onStepClick 时，已完成步骤（idx < current）可点击跳转——
 * 例如报告页（3）可点 1「导入Excel」开始新分析、点 2「脱敏及检查」返回检查页。
 * 未传入或当前步骤/未到步骤不可点。
 */
export default function Stepper({
  current, onStepClick,
}: {
  current: number;
  onStepClick?: (step: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const state = idx < current ? 'done' : idx === current ? 'active' : 'todo';
        const canClick = onStepClick !== undefined && idx < current;
        const content = (
          <>
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
          </>
        );
        return (
          <li key={label} className="flex items-center gap-2">
            {onStepClick && canClick ? (
              <button
                type="button"
                onClick={() => onStepClick(idx)}
                title={`跳转到${label}`}
                className="flex items-center gap-2 rounded-md transition-colors hover:bg-emerald-50"
              >
                {content}
              </button>
            ) : (
              content
            )}
            {idx < STEPS.length - 1 && <span className="text-slate-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

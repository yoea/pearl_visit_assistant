const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
};

export default function Badge({ tone = 'slate', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${TONES[tone] ?? TONES.slate}`}>
      {children}
    </span>
  );
}

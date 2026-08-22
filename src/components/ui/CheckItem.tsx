export default function CheckItem({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{ok ? '✓' : '✗'}</span>
      <div>
        <span className="text-sm text-slate-700">{label}</span>
        {!ok && detail && <div className="mt-0.5 text-xs text-red-600">{detail}</div>}
      </div>
    </li>
  );
}

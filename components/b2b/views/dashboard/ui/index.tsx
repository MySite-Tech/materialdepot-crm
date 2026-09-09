'use client';

export function MetricCard({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: 'muted' | 'warn' }) {
  return (
    <div className="bg-white rounded-lg px-5 py-4 border border-gray-200">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="font-mono text-[26px] leading-tight font-bold text-black mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-1 ${subTone === 'warn' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{sub}</div>}
    </div>
  );
}

export function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 ${className}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-4">{title}</div>
      {children}
    </div>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate" title={label}>{label}</div>
      <div className="font-mono text-lg font-bold mt-0.5" style={{ color: tone || '#111827' }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

export function Bars({ rows, colorFor }: { rows: { label: string; count: number }[]; colorFor?: (label: string) => string }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 w-28 shrink-0 truncate" title={r.label}>{r.label}</span>
          <div className="flex-1 h-3.5 bg-gray-100 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(r.count / max) * 100}%`, background: colorFor?.(r.label) || '#0F766E' }} />
          </div>
          <span className="text-[11px] font-mono font-semibold text-gray-700 w-8 text-right">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

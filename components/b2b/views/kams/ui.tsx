'use client';

import { CLIENT_STATUS_COLORS, CLIENT_STATUS_HINT, ClientOrderMetrics, ClientStatus, temperatureColor } from '../../models/client';

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate" title={label}>{label}</div>
      <div className="text-xl font-bold mt-0.5" style={{ color: tone || '#1F2937' }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: ClientStatus }) {
  const c = CLIENT_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: c + '18', color: c }} title={CLIENT_STATUS_HINT[status]}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status}
    </span>
  );
}

export function TemperatureChip({ value, previous, at }: { value?: number; previous?: number; at?: string }) {
  if (typeof value !== 'number') {
    return <span className="text-[10px] text-gray-300" title="Never scored — §3.2">unscored</span>;
  }
  const c = temperatureColor(value);
  const delta = typeof previous === 'number' ? value - previous : undefined;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="px-1.5 py-0.5 rounded text-[11px] font-bold font-mono" style={{ background: c + '1A', color: c }}
        title={at ? `Scored ${value}/10 on ${at}` : `${value}/10`}>
        {value}
      </span>
      {delta !== undefined && delta !== 0 && (
        <span className={`text-[10px] font-semibold ${delta < 0 ? 'text-red-600' : 'text-green-600'}`} title={`Previous reading ${previous}/10`}>
          {delta < 0 ? '▼' : '▲'}{Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

export function Metric({ value, state, format }: { value: number | string | undefined; state: ClientOrderMetrics['dateState']; format?: (n: number) => string }) {
  if (value === undefined || value === null || value === '') {
    if (state === 'pending') return <span className="text-gray-300">…</span>;
    if (state === 'no-phone') return <span className="text-gray-300" title="No contact number, so orders cannot be linked">no phone</span>;
    if (state === 'unavailable') return <span className="text-blue-400" title="Could not be read from the deal tickets">unread</span>;
    return <span className="text-gray-300">—</span>;
  }
  return <span>{typeof value === 'number' && format ? format(value) : String(value)}</span>;
}

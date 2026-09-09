'use client';

import { CLIENT_STATUS_COLORS, CLIENT_STATUS_HINT, ClientOrderMetrics, ClientStatus } from '../../models/clientModel';

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}

export function StatusPill({ status, days }: { status: ClientStatus; days?: number }) {
  const c = CLIENT_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: c + '18', color: c }}
      title={CLIENT_STATUS_HINT[status] + (days !== undefined ? ` · ${days} days left in the window` : '')}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status}
      {status === 'Active' && days !== undefined && days <= 30 && <span className="font-mono">{days}d</span>}
    </span>
  );
}

export function Metric({ value, state, format }: {
  value: number | string | undefined;
  state: ClientOrderMetrics['dateState'];
  format?: (n: number) => string;
}) {
  if (value === undefined || value === null || value === '') {
    if (state === 'pending') return <span className="text-gray-300">…</span>;
    if (state === 'no-phone') return <span className="text-gray-300" title="No valid contact number, so orders cannot be linked">no phone</span>;
    if (state === 'unavailable') return <span className="text-blue-400" title="Could not be read from the deal tickets">unread</span>;
    return <span className="text-gray-300">—</span>;
  }
  return <span>{typeof value === 'number' && format ? format(value) : String(value)}</span>;
}

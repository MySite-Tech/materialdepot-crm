'use client';

import { daysUntil } from '../../../models/inbound';
import { queueAgeBand } from '../../../models/kam';
import { fmtTime } from '../../../models/reminders';
import { AssignedClientRow } from '../../../types/kam';

export const th = 'text-left font-semibold px-3 py-2 whitespace-nowrap';
export const td = 'px-3 py-2.5 align-top';

export function ListHead({ accent, title, count, extra, rule }: { accent: string; title: string; count: number; extra?: string; rule: string }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: accent }} />
        <h2 className="text-[14px] font-bold text-gray-900">{title}</h2>
        <span className="text-[12px] font-semibold text-gray-400 tabular-nums">{count}</span>
        {extra && <span className="text-[12px] font-semibold text-gray-600">· {extra}</span>}
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{rule}</p>
    </div>
  );
}

export function GapsChip({ gaps }: { gaps: { label: string }[] }) {
  if (!gaps.length) return null;
  return (
    <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="shrink-0 text-[10px] font-semibold text-red-600 bg-red-50 rounded px-1">
      {gaps.length} missing
    </span>
  );
}

export function FirmCell({ r }: { r: AssignedClientRow }) {
  return (
    <div className="max-w-[240px] min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold text-gray-800 truncate">{r.company}</span>
        <GapsChip gaps={r.gaps} />
      </div>
      <div className="text-[10px] text-gray-400 truncate">
        {r.client.kam || 'unassigned'}
        {r.segment && ` · Segment ${r.segment}`}
        {` · ${r.source}`}
        {r.upcomingProject && <span className="text-[#0F766E]"> · project noted</span>}
      </div>
    </div>
  );
}

export function FollowUpCell({ r, today }: { r: AssignedClientRow; today: string }) {
  if (!r.nextFollowUpDate) return <span className="text-gray-300">none set</span>;
  const late = r.followUp === 'overdue' ? Math.abs(daysUntil(r.nextFollowUpDate, today) ?? 0) : 0;
  const aged = late ? queueAgeBand(late) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono" style={{ color: r.followUp === 'overdue' ? '#DC2626' : r.followUp === 'today' ? '#EA580C' : '#4B5563' }}>
        {r.followUp === 'today' ? 'Today' : r.nextFollowUpDate}
        {r.nextFollowUpTime && <span className="text-gray-400"> · {fmtTime(r.nextFollowUpTime)}</span>}
      </span>
      <span className="text-[10.5px] font-medium text-gray-600">
        {r.followUpFor === 'Meeting' ? 'Meeting' : 'Call'}
      </span>
      {aged ? (
        <span className="w-fit px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: aged.color + '18', color: aged.color }}>
          {late}d overdue
        </span>
      ) : r.daysSinceContact !== undefined && <span className="text-[10px] text-gray-400">{r.daysSinceContact}d since contact</span>}
    </div>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}

export function Pager({ total, page, pages, size, setPage }: {
  total: number; page: number; pages: number; size: number; setPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
      <span className="text-[11px] text-gray-400">Showing {page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}</span>
      {total > size && (
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(page - 1)} disabled={page === 0}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages - 1}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}

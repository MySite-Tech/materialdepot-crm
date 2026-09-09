'use client';

import {
  INBOUND_STATUS_COLORS, PRIORITY_COLORS, LEAD_TYPE_COLORS,
  FOLLOW_UP_COLORS, FOLLOW_UP_LABEL, OWNER_CHIP, OWNER_LABEL,
  followUpBucket, daysUntil, nameIsJustThePhone,
  type InboundStatus, type Priority, type LeadType, type FieldOwner,
} from '../models/inbound';

export const inputCls =
  'w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E] disabled:bg-gray-50 disabled:text-gray-400';
const readonlyCls =
  'w-full px-2.5 py-1.5 text-[12px] rounded-md bg-gray-50 text-gray-600 border border-transparent';
export const errorInputCls =
  'w-full px-2.5 py-1.5 text-[12px] border border-red-300 rounded-md outline-none bg-red-50/40 focus:border-red-500';

export function Pill({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: color + '18', color }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ s }: { s: InboundStatus }) {
  return <Pill color={INBOUND_STATUS_COLORS[s]}>{s}</Pill>;
}

export function PriorityChip({ p }: { p?: Priority }) {
  if (!p) return <span className="text-[11px] text-gray-300" title="No priority set">—</span>;
  return <Pill color={PRIORITY_COLORS[p]}>{p}</Pill>;
}

export function LeadName({ lead }: {
  lead: { companyName?: string; company?: string; phone?: string };
}) {
  const own = String(lead.companyName || '').trim();
  if (own) return <span>{own}</span>;
  if (nameIsJustThePhone(lead)) {
    return (
      <span className="text-gray-400 font-normal italic" title="Kylas has no company name for this lead — add one in the drawer">
        Not named yet
      </span>
    );
  }
  return <span>{String(lead.company || '').trim() || 'Unnamed lead'}</span>;
}

export function LeadTypeChip({ t }: { t?: LeadType }) {
  if (!t) return null;
  return <Pill color={LEAD_TYPE_COLORS[t]}>{t}</Pill>;
}

export function FollowUpChip({ date, today }: { date?: string; today?: string }) {
  const bucket = followUpBucket(date, today);
  const color = FOLLOW_UP_COLORS[bucket];
  if (bucket === 'none') {
    return <Pill color={color}>{FOLLOW_UP_LABEL.none}</Pill>;
  }
  const d = daysUntil(date, today);
  const detail =
    bucket === 'today' ? 'Due today'
      : bucket === 'overdue' ? `${Math.abs(d ?? 0)}d overdue`
        : `in ${d}d`;
  return <Pill color={color} title={date}>{detail}</Pill>;
}

export function ProvenanceChip({ owner }: { owner: FieldOwner }) {
  const muted = owner === 'crm';
  return (
    <span
      title={OWNER_LABEL[owner]}
      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
        muted ? 'text-[#0F766E] bg-[#0F766E]/8' : 'text-gray-400 bg-gray-100'
      }`}
    >
      {OWNER_CHIP[owner]}
    </span>
  );
}

export function SectionCard({
  title, owner, subtitle, right, children, className = '',
}: {
  title: string;
  owner?: FieldOwner;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-600 whitespace-nowrap">{title}</h3>
          {owner && <ProvenanceChip owner={owner} />}
          {subtitle && <span className="text-[10px] text-gray-400 truncate">{subtitle}</span>}
        </div>
        {right}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function Field({
  label, owner, hint, error, required, children, className = '',
}: {
  label: string;
  owner?: FieldOwner;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {owner && <ProvenanceChip owner={owner} />}
      </span>
      {children}
      {hint && !error && <span className="block text-[10px] text-gray-400 mt-1 leading-snug">{hint}</span>}
      {error && <span className="block text-[10px] text-red-500 mt-1 leading-snug">{error}</span>}
    </label>
  );
}

export function ReadValue({ v }: { v?: string | number | null }) {
  const s = v === 0 ? '0' : String(v ?? '').trim();
  return <div className={readonlyCls}>{s || '—'}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-gray-400">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-400 text-center py-3">{children}</p>;
}

export function GateErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="rounded-md border border-red-200 bg-red-50 px-3 py-2 flex flex-col gap-1">
      {errors.map((e) => (
        <li key={e} className="text-[11px] text-red-700 leading-snug">• {e}</li>
      ))}
    </ul>
  );
}

export function EnrichmentBadge({ gaps, onClick }: { gaps: string[]; onClick?: () => void }) {
  if (!gaps.length) return null;
  return (
    <button
      onClick={onClick}
      title={`Missing: ${gaps.join(', ')}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap"
    >
      ⚠ {gaps.length} to fill
    </button>
  );
}

export function fmtLeadDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso);
  return new Date(ms).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function fmtDay(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) return String(iso);
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

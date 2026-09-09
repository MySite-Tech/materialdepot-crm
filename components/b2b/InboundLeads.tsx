'use client';

// ── Inbound Leads ────────────────────────────────────────────────────────────
// Implements the Inbound CRM Module PRD v1.0. Three views over one dataset:
//
//   Today  — the PRD §5.1 Daily Assigned Table. The default, because what a rep
//            needs on opening the tab is today's call list, not a wall of cards.
//   Board  — the five PRD §3.4 statuses. Drag to move; a status with unmet
//            requirements opens a form instead of failing silently.
//   List   — the whole field set, filterable and exportable.
//
// Field ownership, the status machine and the gates live in `inboundModel.ts`.

import { useEffect, useMemo, useState } from 'react';
import {
  fmtINR, NEW_KYLAS_STAGES, type InboundLead,
} from './mockData';
import {
  INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT,
  INBOUND_LOCATIONS, CLIENT_TYPES, PRIORITIES, LEAD_TYPES,
  statusGateErrors, enrichmentGaps, followUpBucket, istToday, lastAttempt,
  type InboundStatus, type Priority, type FollowUpBucket,
} from './inboundModel';
import {
  StatusBadge, PriorityChip, LeadTypeChip, FollowUpChip, EnrichmentBadge,
  Spinner, Empty, GateErrors, Field, LeadName, inputCls, errorInputCls,
  fmtDay, fmtLeadDateTime,
} from './inboundChips';
import { B2B_INBOUND_OWNER_LIST, B2B_INBOUND_PAGE_SIZE } from '@/lib/mockApi';
import { fetchInboundBoard, upsertInboundLead, B2B_FRESH_START } from '@/lib/b2bLeads';
import InboundDrawer from './InboundDrawer';
import {
  ExportButton, exportRowsCsv, exportRowsExcel, todayStr, useDragAutoScroll,
  type ExportFormat, type ExportScope,
} from './exportUtils';

// ── Export: the PRD's field set, not the old six columns ─────────────────────
const EXPORT_HEADERS = [
  'Lead date', 'Company', 'Contact name', 'Contact number', 'Assigned BM',
  'GST', 'Segment', 'Client type', 'Lead type', 'Priority', 'Location',
  'Selection', 'Requirement', 'Expected value', 'Status', 'Next follow-up',
  'Attempts', 'Last outcome', 'Enq ID', 'Order value', 'Lost reason',
  'Spok', 'KAM', 'Qualified by',
];

const toExportRow = (l: InboundLead): (string | number)[] => {
  const last = lastAttempt(l.callAttempts);
  return [
    l.leadCreatedAt ? fmtLeadDateTime(l.leadCreatedAt) : '',
    l.companyName || l.company || '',
    l.contactName || '',
    l.phone || '',
    l.owner || '',
    l.gstNumber || '',
    l.segment || '',
    l.clientType || '',
    l.leadType || '',
    l.priority || '',
    l.location || '',
    (l.selections || []).join(' / '),
    l.requirement || '',
    l.expectedOrderValue || '',
    l.stage,
    l.followUpDate || '',
    l.callAttempts?.length || 0,
    last?.outcome || '',
    l.enqId || '',
    l.orderValue || '',
    l.lostReason || '',
    l.placedUnder?.spok || '',
    l.kam || '',
    l.presalesOwner || '',
  ];
};

const gapsFor = (l: InboundLead) => enrichmentGaps({
  companyName: l.companyName, gstNumber: l.gstNumber, segment: l.segment,
  clientType: l.clientType, leadType: l.leadType, priority: l.priority,
  selections: l.selections, expectedOrderValue: l.expectedOrderValue,
});

const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

/** IST day of an ISO instant, for comparing against `istToday()`. */
const istDay = (iso: string | undefined): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso).slice(0, 10);
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// ── Summary strip (PRD §5.2) ─────────────────────────────────────────────────

function Tile({
  label, value, sub, accent, muted,
}: {
  label: string; value: string; sub?: string; accent?: string; muted?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />}
        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
      </div>
      <div className={`text-[22px] font-bold leading-tight mt-1 ${muted ? 'text-gray-300' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ── Move-with-requirements modal ─────────────────────────────────────────────
//
// Dragging a card into `Follow up`, `PI Shared` or `Lost` needs a field the PRD
// makes mandatory. Collecting it here is the whole point: the previous board
// applied the drag immediately and wrote a status whose required field stayed
// empty — which is how 81 leads ended up in "Followup Required" with no
// follow-up date on any of them.

function MoveModal({
  lead, target, onCancel, onDone,
}: {
  lead: InboundLead;
  target: InboundStatus;
  onCancel: () => void;
  onDone: (patch: Partial<InboundLead>) => void;
}) {
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate || '');
  const [followUpTime, setFollowUpTime] = useState(lead.followUpTime || '');
  const [enqId, setEnqId] = useState(lead.enqId || '');
  const [lostReason, setLostReason] = useState(lead.lostReason || '');
  const [touched, setTouched] = useState(false);

  const errors = statusGateErrors({ status: target, followUpDate, enqId, lostReason });
  const needsFollowUp = target === 'Follow up' || target === 'PI Shared';
  const needsEnq = target === 'PI Shared';
  const needsReason = target === 'Lost';

  const commit = () => {
    if (errors.length) { setTouched(true); return; }
    onDone({
      stage: target,
      followUpDate: needsFollowUp ? followUpDate : lead.followUpDate,
      followUpTime: needsFollowUp ? followUpTime : lead.followUpTime,
      enqId: needsEnq ? enqId.trim() : lead.enqId,
      lostReason: needsReason ? lostReason : lead.lostReason,
    });
  };

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-[440px] mx-4">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-bold text-gray-900">Move to {target}</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            <LeadName lead={lead} />
            {lead.phone ? <span className="font-mono"> · {lead.phone}</span> : null}
            {' · '}{INBOUND_STATUS_HINT[target]}
          </p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {needsFollowUp && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Next follow-up date" required error={touched ? errors.find((e) => e.includes('follow-up')) : undefined}>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className={touched && !followUpDate ? errorInputCls : inputCls}
                />
              </Field>
              <Field label="Time" hint="Optional">
                <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          {needsEnq && (
            <Field
              label="Enq ID"
              required
              error={touched ? errors.find((e) => e.includes('Enq ID')) : undefined}
              hint="Open the lead afterwards to pull the order value from the deal ticket."
            >
              <input
                value={enqId}
                onChange={(e) => setEnqId(e.target.value)}
                placeholder="ENQ-…"
                className={touched && !enqId.trim() ? errorInputCls : inputCls}
              />
            </Field>
          )}
          {needsReason && (
            <Field label="Lost reason" required error={touched ? errors.find((e) => e.includes('lost reason')) : undefined}>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className={touched && !lostReason ? errorInputCls : inputCls}
              >
                <option value="">Select a reason…</option>
                {['Selection Not Liked', 'Price Issue', 'Timeline/Delivery Delay', 'Unreachable (4 attempts)', 'Enquiry invalid']
                  .map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          {target === 'Closed' && (
            <p className="text-[11px] text-gray-500 leading-snug">
              Open the lead afterwards to record <strong>Placed under</strong> and assign a KAM —
              neither blocks the move.
            </p>
          )}
          {touched && errors.length > 0 && <GateErrors errors={errors} />}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">
            Cancel
          </button>
          <button onClick={commit} className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">
            Move
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Board card ───────────────────────────────────────────────────────────────

function LeadCard({ lead, today, onClick, onDragStart }: {
  lead: InboundLead; today: string; onClick: () => void; onDragStart: () => void;
}) {
  const gaps = gapsFor(lead);
  const last = lastAttempt(lead.callAttempts);
  const attempts = lead.callAttempts?.length || 0;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#0F766E] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="text-[12.5px] font-semibold text-gray-900 leading-tight min-w-0 truncate">
          <LeadName lead={lead} />
        </div>
        <PriorityChip p={lead.priority} />
      </div>
      <div className="text-[10.5px] text-gray-400 mt-0.5 font-mono truncate">{lead.phone || '—'}</div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {lead.clientType && <span className="text-[10px] text-gray-500">{lead.clientType}</span>}
        <LeadTypeChip t={lead.leadType} />
      </div>
      {(lead.stage === 'Follow up' || lead.stage === 'PI Shared') && (
        <div className="mt-1.5"><FollowUpChip date={lead.followUpDate} today={today} /></div>
      )}
      {(lead.stage === 'PI Shared' || lead.stage === 'Closed') && !!lead.orderValue && (
        <div className="text-[11px] font-mono font-semibold text-gray-700 mt-1.5">{fmtINR(lead.orderValue)}</div>
      )}
      {lead.stage === 'Lost' && (
        <div className="text-[10.5px] text-red-500 mt-1.5 leading-snug">
          {lead.lostReason || <span className="text-amber-600">No reason recorded</span>}
        </div>
      )}
      {lead.stage === 'Closed' && (
        <div className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">
          {lead.kam ? `KAM: ${lead.kam}` : <span className="text-amber-600">No KAM assigned</span>}
        </div>
      )}
      <div className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-gray-50">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          {attempts ? `${attempts}/4 · ${last?.outcome}` : 'No calls yet'}
        </span>
        {gaps.length > 0 && (
          <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">
            ⚠ {gaps.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Daily assigned table (PRD §5.1) ──────────────────────────────────────────

const BUCKET_ORDER: FollowUpBucket[] = ['overdue', 'today', 'upcoming', 'none'];
const BUCKET_TITLE: Record<FollowUpBucket, string> = {
  overdue:  'Overdue',
  today:    'Due today',
  upcoming: 'Upcoming',
  none:     'No follow-up date set',
};
const BUCKET_NOTE: Record<FollowUpBucket, string> = {
  overdue:  'Past their follow-up date — call these first.',
  today:    "Today's committed calls.",
  upcoming: 'Scheduled ahead.',
  none:     'On a status that needs a date but has none — mostly leads carried over from the old board.',
};

function DailyTable({
  leads, today, onOpen,
}: {
  leads: InboundLead[]; today: string; onOpen: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<FollowUpBucket, InboundLead[]> = { overdue: [], today: [], upcoming: [], none: [] };
    for (const l of leads) g[followUpBucket(l.followUpDate, today)].push(l);
    for (const k of BUCKET_ORDER) {
      g[k].sort((a, b) => {
        const p = (PRIORITY_RANK[a.priority || ''] ?? 3) - (PRIORITY_RANK[b.priority || ''] ?? 3);
        if (p !== 0) return p;
        const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
        if (d !== 0) return k === 'upcoming' ? d : -d;
        return (a.followUpTime || '').localeCompare(b.followUpTime || '');
      });
    }
    return g;
  }, [leads, today]);

  const anything = BUCKET_ORDER.some((k) => grouped[k].length > 0);
  if (!anything) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No leads on follow-up in this filter.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {BUCKET_ORDER.map((bucket) => {
        const rows = grouped[bucket];
        if (!rows.length) return null;
        return (
          <div key={bucket} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-baseline justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="text-[12px] font-bold text-gray-800 whitespace-nowrap">{BUCKET_TITLE[bucket]}</h3>
                <span className="text-[11px] font-semibold text-gray-400">{rows.length}</span>
                <span className="text-[10px] text-gray-400 truncate hidden sm:inline">{BUCKET_NOTE[bucket]}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['Pri', 'Company', 'Contact', 'Client type', 'Status', 'Calls', 'Follow-up', 'BM', 'Value', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const last = lastAttempt(l.callAttempts);
                    const gaps = gapsFor(l);
                    return (
                      <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                        <td className="px-3 py-2"><PriorityChip p={l.priority} /></td>
                        <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">
                          <LeadName lead={l} />
                        </td>
                        <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.clientType || '—'}</td>
                        <td className="px-3 py-2"><StatusBadge s={l.stage} /></td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {l.callAttempts?.length
                            ? <>{l.callAttempts.length}/4 <span className={last?.outcome === 'RNR' ? 'text-red-500' : 'text-[#0F766E]'}>{last?.outcome}</span></>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {l.followUpDate
                            ? <span className="text-gray-600">{fmtDay(l.followUpDate)}{l.followUpTime ? ` · ${l.followUpTime}` : ''}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.owner}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                          {l.orderValue ? fmtINR(l.orderValue)
                            : l.expectedOrderValue ? <span className="text-gray-400">~{fmtINR(l.expectedOrderValue)}</span>
                              : '—'}
                        </td>
                        <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact side list — today's arrivals and the open PI Shared leads. */
function SidePanel({
  title, note, leads, today, onOpen, emptyText,
}: {
  title: string; note: string; leads: InboundLead[]; today: string;
  onOpen: (id: string) => void; emptyText: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[12px] font-bold text-gray-800">{title}</h3>
          <span className="text-[11px] font-semibold text-gray-400">{leads.length}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{note}</p>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
        {leads.length === 0 ? <Empty>{emptyText}</Empty> : leads.map((l) => (
          <button
            key={l.id}
            onClick={() => onOpen(l.id)}
            className="w-full text-left px-4 py-2.5 hover:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-semibold text-gray-900 truncate"><LeadName lead={l} /></span>
              <PriorityChip p={l.priority} />
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{l.phone || '—'}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] text-gray-500">{l.owner}</span>
              {!!l.orderValue && <span className="text-[10px] font-mono font-semibold text-gray-700">{fmtINR(l.orderValue)}</span>}
              {l.stage === 'PI Shared' && <FollowUpChip date={l.followUpDate} today={today} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

type View = 'today' | 'board' | 'list';

export default function InboundLeads() {
  const [view, setView] = useState<View>('today');

  // Filters — PRD §5.3 (status, priority, assigned BM, client type, date range)
  const [owner, setOwner] = useState('all');
  const [status, setStatus] = useState<'all' | InboundStatus>('all');
  const [priority, setPriority] = useState<'all' | Priority>('all');
  const [clientType, setClientType] = useState('all');
  const [leadType, setLeadType] = useState('all');
  const [location, setLocation] = useState('all');
  const [newKylasStage, setNewKylasStage] = useState<'all' | number>('all');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);

  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<InboundStatus | null>(null);
  const [move, setMove] = useState<{ lead: InboundLead; target: InboundStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const today = istToday();

  const ownerId = useMemo(
    () => (owner === 'all' ? undefined : B2B_INBOUND_OWNER_LIST.find((o) => o.name === owner)?.id),
    [owner],
  );
  const kylasStageFilter = newKylasStage === 'all' ? undefined : newKylasStage;
  const serverOpts = useMemo(() => ({
    ownerId, search: appliedSearch, createdFrom: createdAfter,
    createdTo: createdBefore, kylasStage: kylasStageFilter,
  }), [ownerId, appliedSearch, createdAfter, createdBefore, kylasStageFilter]);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchInboundBoard({ page: 0, ...serverOpts })
      .then((res) => {
        setLeads(res.leads);
        setPage(res.page);
        setHasMore(res.hasMore);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leads'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [serverOpts]);

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    fetchInboundBoard({ page: page + 1, ...serverOpts })
      .then((res) => {
        setLeads((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          return [...prev, ...res.leads.filter((l) => !seen.has(l.id))];
        });
        setPage(res.page);
        setHasMore(res.hasMore);
        setTotal(res.total);
      })
      .finally(() => setLoadingMore(false));
  };

  // Client-side filters — these read fields Kylas has no rule for.
  const filtered = useMemo(() => leads.filter((l) => {
    if (status !== 'all' && l.stage !== status) return false;
    if (priority !== 'all' && l.priority !== priority) return false;
    if (clientType !== 'all' && l.clientType !== clientType) return false;
    if (leadType !== 'all' && l.leadType !== leadType) return false;
    if (location !== 'all' && l.location !== location) return false;
    if (onlyGaps && gapsFor(l).length === 0) return false;
    return true;
  }), [leads, status, priority, clientType, leadType, location, onlyGaps]);

  const byStatus = (s: InboundStatus) => filtered.filter((l) => l.stage === s);

  // ── Summary (PRD §5.2) ──
  const summary = useMemo(() => {
    const pi = filtered.filter((l) => l.stage === 'PI Shared');
    const closed = filtered.filter((l) => l.stage === 'Closed');
    const lost = filtered.filter((l) => l.stage === 'Lost');
    const sum = (ls: InboundLead[]) => ls.reduce((a, l) => a + (Number(l.orderValue) || 0), 0);
    const newToday = filtered.filter((l) => istDay(l.leadCreatedAt) === today).length;
    const closedToday = closed.filter((l) => istDay(l.statusChangedAt) === today).length;
    const piToday = pi.filter((l) => istDay(l.statusChangedAt) === today).length;
    const overdue = filtered.filter((l) =>
      (l.stage === 'Follow up' || l.stage === 'PI Shared') && followUpBucket(l.followUpDate, today) === 'overdue').length;
    const dueToday = filtered.filter((l) =>
      (l.stage === 'Follow up' || l.stage === 'PI Shared') && followUpBucket(l.followUpDate, today) === 'today').length;
    const untimed = [...pi, ...closed].filter((l) => !l.statusChangedAt).length;
    return {
      newToday, overdue, dueToday, untimed,
      pi: { n: pi.length, value: sum(pi), today: piToday },
      closed: { n: closed.length, value: sum(closed), today: closedToday },
      lost: { n: lost.length },
      gaps: filtered.filter((l) => gapsFor(l).length > 0).length,
    };
  }, [filtered, today]);

  // ── Writes ──
  const applyPatch = async (lead: InboundLead, patch: Partial<InboundLead>) => {
    const statusChanged = patch.stage !== undefined && patch.stage !== lead.stage;
    const updated: InboundLead = {
      ...lead,
      ...patch,
      statusChangedAt: statusChanged ? new Date().toISOString() : lead.statusChangedAt,
      value: Number(patch.orderValue ?? lead.orderValue) || 0,
    };
    // Optimistic, then reconciled: a failed write rolls the card back rather
        // than leaving the board showing a status the database never accepted.
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
    const err = await upsertInboundLead(updated);
    if (err) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      setMoveError(`Could not move ${lead.companyName || lead.company}: ${err}`);
    }
  };

  const requestMove = (id: string, target: InboundStatus) => {
    const lead = leads.find((l) => l.id === id);
    setDragId(null);
    setDragOver(null);
    if (!lead || lead.stage === target) return;
    setMoveError(null);
    const errs = statusGateErrors({
      status: target,
      followUpDate: lead.followUpDate,
      enqId: lead.enqId,
      lostReason: lead.lostReason,
    });
    if (errs.length) { setMove({ lead, target }); return; }
    applyPatch(lead, { stage: target });
  };

  // ── Export ──
  const fetchAll = async (opts: Parameters<typeof fetchInboundBoard>[0]): Promise<InboundLead[]> => {
    const all: InboundLead[] = [];
    const seen = new Set<string>();
    let p = 0;
    for (;;) {
      const res = await fetchInboundBoard({ ...opts, page: p });
      for (const l of res.leads) if (!seen.has(l.id)) { seen.add(l.id); all.push(l); }
      if (!res.hasMore) break;
      p += 1;
      await new Promise((r) => setTimeout(r, 250)); // stay under Kylas rate limits
    }
    return all;
  };

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    setExporting(true);
    try {
      let list = await fetchAll(scope === 'all' ? {} : serverOpts);
      if (scope !== 'all') {
        list = list.filter((l) =>
          (status === 'all' || l.stage === status)
          && (priority === 'all' || l.priority === priority)
          && (clientType === 'all' || l.clientType === clientType)
          && (leadType === 'all' || l.leadType === leadType)
          && (location === 'all' || l.location === location)
          && (!onlyGaps || gapsFor(l).length > 0));
      }
      if (!list.length) { setError('No leads matched — nothing to export.'); return; }
      const name = `b2b_inbound_leads_${scope}_${todayStr()}`;
      const rows = list.map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, rows, name);
      else await exportRowsExcel(EXPORT_HEADERS, rows, name, 'Inbound Leads');
    } catch (e) {
      setError('Export failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setOwner('all'); setStatus('all'); setPriority('all'); setClientType('all');
    setLeadType('all'); setLocation('all'); setNewKylasStage('all');
    setCreatedAfter(''); setCreatedBefore(''); setOnlyGaps(false);
    setSearch(''); setAppliedSearch('');
  };

  const activeFilters = [
    owner !== 'all', status !== 'all', priority !== 'all', clientType !== 'all',
    leadType !== 'all', location !== 'all', newKylasStage !== 'all',
    !!createdAfter, !!createdBefore, onlyGaps, !!appliedSearch,
  ].filter(Boolean).length;

  const selected = leads.find((l) => l.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

  // Follow-up work list for the Today view: anything on a status that carries a
  // follow-up date. New leads and closed/lost ones are not call-list rows.
  const followUpLeads = useMemo(
    () => filtered.filter((l) => l.stage === 'Follow up' || l.stage === 'PI Shared'),
    [filtered],
  );
  const newToday = useMemo(
    () => filtered.filter((l) => l.stage === 'New').sort((a, b) => (b.leadCreatedAt || '').localeCompare(a.leadCreatedAt || '')),
    [filtered],
  );
  const piLeads = useMemo(() => filtered.filter((l) => l.stage === 'PI Shared'), [filtered]);

  // List view pagination over the already-loaded set.
  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [serverOpts, status, priority, clientType, leadType, location, onlyGaps]);
  const listPages = Math.max(1, Math.ceil(filtered.length / B2B_INBOUND_PAGE_SIZE));
  const listRows = filtered.slice(listPage * B2B_INBOUND_PAGE_SIZE, (listPage + 1) * B2B_INBOUND_PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Inbound Leads</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Qualified by Presales in Kylas · {B2B_INBOUND_OWNER_LIST.map((o) => o.name).join(' & ')}
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
            {!loading && total > 0 && (
              <span className="text-gray-400"> · {total} unactioned in Kylas</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            {(['today', 'board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[12px] font-semibold capitalize ${view === v ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button
            onClick={load}
            disabled={loading}
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            ↻ Sync from Kylas
          </button>
        </div>
      </div>

      {/* ── Summary (PRD §5.2) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        <Tile label="New today" value={String(summary.newToday)} sub="arrived in Kylas today" accent={INBOUND_STATUS_COLORS.New} />
        <Tile
          label="PI Shared"
          value={String(summary.pi.n)}
          sub={summary.pi.value ? fmtINR(summary.pi.value) : 'no order value yet'}
          accent={INBOUND_STATUS_COLORS['PI Shared']}
        />
        <Tile
          label="Closed"
          value={String(summary.closed.n)}
          sub={summary.closed.value ? fmtINR(summary.closed.value) : 'no order value yet'}
          accent={INBOUND_STATUS_COLORS.Closed}
        />
        <Tile label="Lost" value={String(summary.lost.n)} accent={INBOUND_STATUS_COLORS.Lost} />
        <Tile
          label="Overdue follow-ups"
          value={String(summary.overdue)}
          sub={`${summary.dueToday} due today`}
          accent="#DC2626"
          muted={summary.overdue === 0}
        />
        <Tile
          label="Need enrichment"
          value={String(summary.gaps)}
          sub="missing §3.2 / §3.3 fields"
          accent="#F59E0B"
          muted={summary.gaps === 0}
        />
      </div>
      <p className="text-[10px] text-gray-400 mb-4 leading-snug">
        {[
          `Counts cover the ${activeFilters ? 'current filter' : 'loaded window'}.`,
          'Order value always comes from the matched deal ticket, never a typed estimate.',
          summary.untimed > 0
            ? `${summary.untimed} PI/closed ${summary.untimed === 1 ? 'lead pre-dates' : 'leads pre-date'} status timestamps, so ${summary.untimed === 1 ? 'it is' : 'they are'} not counted into today's figures.`
            : '',
        ].filter(Boolean).join(' ')}
      </p>

      {/* ── Filters (PRD §5.3) ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Search</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setAppliedSearch(search.trim()); }}
                  placeholder="Company, name or phone…"
                  className={inputCls}
                />
                {search && (
                  <button
                    onClick={() => { setSearch(''); setAppliedSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none"
                  >×</button>
                )}
              </div>
              <button
                onClick={() => setAppliedSearch(search.trim())}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap"
              >Search</button>
            </div>
          </div>
          {([
            ['Status', 'All statuses', status, setStatus, ['all', ...INBOUND_STATUSES]],
            ['Priority', 'All priorities', priority, setPriority, ['all', ...PRIORITIES]],
            ['Assigned BM', 'All BMs', owner, setOwner, ['all', ...B2B_INBOUND_OWNER_LIST.map((o) => o.name)]],
            ['Client type', 'All client types', clientType, setClientType, ['all', ...CLIENT_TYPES]],
            ['Lead type', 'All lead types', leadType, setLeadType, ['all', ...LEAD_TYPES]],
            ['Location', 'All locations', location, setLocation, ['all', ...INBOUND_LOCATIONS]],
          ] as const).map(([label, allLabel, val, setter, opts]) => (
            <div key={label}>
              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
              <select
                value={val as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]"
              >
                {opts.map((o) => <option key={o} value={o}>{o === 'all' ? allLabel : o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Kylas tag</label>
            <select
              value={newKylasStage}
              onChange={(e) => setNewKylasStage(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]"
            >
              <option value="all">All tags</option>
              {NEW_KYLAS_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Lead date from</label>
            <input type="date" min={B2B_FRESH_START} value={createdAfter} onChange={(e) => setCreatedAfter(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">to</label>
            <input type="date" min={B2B_FRESH_START} value={createdBefore} onChange={(e) => setCreatedBefore(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <button
            onClick={() => setOnlyGaps((v) => !v)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              onlyGaps ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
            }`}
          >
            ⚠ Needs enrichment
          </button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
              Clear {activeFilters}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {moveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {loading ? <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading leads from Kylas and the CRM…" /></div> : (
        <>
          {/* ── Today (PRD §5.1) ── */}
          {view === 'today' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 items-start">
              <DailyTable leads={followUpLeads} today={today} onOpen={setSelectedId} />
              <div className="flex flex-col gap-3">
                <SidePanel
                  title="New — not yet actioned"
                  note="Straight from Kylas. Log the first call to start the attempt cycle."
                  leads={newToday}
                  today={today}
                  onOpen={setSelectedId}
                  emptyText="Nothing new waiting."
                />
                <SidePanel
                  title="PI Shared"
                  note="Awaiting a decision. Order value comes from the deal ticket."
                  leads={piLeads}
                  today={today}
                  onOpen={setSelectedId}
                  emptyText="No PIs out."
                />
              </div>
            </div>
          )}

          {/* ── Board ── */}
          {view === 'board' && (
            <div
              ref={kanbanScroll.ref}
              className="flex gap-3 overflow-x-auto pb-3 items-start"
              onDragOver={kanbanScroll.onDragOver}
              onDragEnd={kanbanScroll.onDragEnd}
              onDrop={kanbanScroll.onDrop}
            >
              {INBOUND_STATUSES.map((s) => {
                const items = byStatus(s);
                const isOver = dragOver === s;
                return (
                  <div
                    key={s}
                    className="flex-1 min-w-[220px] shrink-0"
                    onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
                    onDragLeave={() => setDragOver((c) => (c === s ? null : c))}
                    onDrop={() => dragId && requestMove(dragId, s)}
                  >
                    <div className={`bg-[#F2F2F3] rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
                      <div className="h-1" style={{ background: INBOUND_STATUS_COLORS[s] }} />
                      <div className="px-3 py-2 bg-white border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">{s}</span>
                          <span className="text-[11px] font-semibold text-gray-400">
                            {s === 'New' && total > items.length ? `${items.length} of ${total}` : items.length}
                          </span>
                        </div>
                        <p className="text-[9.5px] text-gray-400 leading-snug mt-0.5">{INBOUND_STATUS_HINT[s]}</p>
                      </div>
                      <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                        {items.length === 0
                          ? <div className="text-[11px] text-gray-400 text-center py-5">{isOver ? 'Drop here' : 'Empty'}</div>
                          : items.map((l) => (
                            <LeadCard
                              key={l.id}
                              lead={l}
                              today={today}
                              onClick={() => setSelectedId(l.id)}
                              onDragStart={() => setDragId(l.id)}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── List ── */}
          {view === 'list' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {['Company', 'Contact', 'Client type', 'Seg', 'Lead', 'Pri', 'Status', 'Calls', 'Follow-up', 'BM', 'Location', 'Value', ''].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((l) => {
                      const last = lastAttempt(l.callAttempts);
                      const gaps = gapsFor(l);
                      return (
                        <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                          <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate"><LeadName lead={l} /></td>
                          <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.clientType || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{l.segment || '—'}</td>
                          <td className="px-3 py-2"><LeadTypeChip t={l.leadType} /></td>
                          <td className="px-3 py-2"><PriorityChip p={l.priority} /></td>
                          <td className="px-3 py-2"><StatusBadge s={l.stage} /></td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {l.callAttempts?.length ? `${l.callAttempts.length}/4 ${last?.outcome}` : '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                            {l.followUpDate ? fmtDay(l.followUpDate) : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.owner}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.location || '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                            {l.orderValue ? fmtINR(l.orderValue)
                              : l.expectedOrderValue ? <span className="text-gray-400">~{fmtINR(l.expectedOrderValue)}</span>
                                : '—'}
                          </td>
                          <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {listRows.length === 0 && <Empty>No leads match these filters.</Empty>}
              <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">
                  Page {listPage + 1} of {listPages} · {filtered.length} loaded
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setListPage((p) => Math.max(0, p - 1))}
                    disabled={listPage === 0}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40"
                  >← Prev</button>
                  <button
                    onClick={() => setListPage((p) => Math.min(listPages - 1, p + 1))}
                    disabled={listPage >= listPages - 1}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40"
                  >Next →</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Load more (the Kylas New pool is paged) ── */}
          {hasMore && (
            <div className="flex items-center justify-center py-4">
              {loadingMore ? <Spinner label="Loading more…" /> : (
                <button
                  onClick={loadMore}
                  className="px-4 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
                >
                  Load more from Kylas{total > 0 ? ` · ${total} unactioned in total` : ''}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {move && (
        <MoveModal
          lead={move.lead}
          target={move.target}
          onCancel={() => setMove(null)}
          onDone={(patch) => { applyPatch(move.lead, patch); setMove(null); }}
        />
      )}

      {selected && (
        <InboundDrawer
          lead={selected}
          onClose={() => setSelectedId(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
        />
      )}
    </div>
  );
}

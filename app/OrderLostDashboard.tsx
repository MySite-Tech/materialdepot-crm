'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  fetchOrderLostSummary,
  fetchCRMLeads,
  fetchAvailableBMs,
  fetchCategoryOptions,
  CategoryOption,
  AvailableBM,
  CRMLeadRow,
  OrderLostBranchSummary,
} from '../lib/mockApi';

interface Props {
  branches: string[];
  allowedBranches: string[];
}

// The lost-reason → issue bucket mapping (Category / Retail / Other / Remove)
// and Active/Won/Lost bucketing live server-side in CRMOrderLostSummaryApi.
// "Remove" reasons (Order Closed Already) are non-losses, excluded from every
// count and value so Active/Won/Lost shares sum to 100%.
const normalizeReason = (r: string): string => (r || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const LOST_REASON_OPTIONS = [
  'Pricing Issue', 'Credit Issue', 'Order Closed Already', 'Cash/Non GST Issue',
  'Delayed Estimate', 'Sample/Material Not Approved', 'Enquiry Invalid',
  'Enquiry Cancelled', 'Availibility Issues', 'Not Responding',
];

// ── Formatting ──────────────────────────────────────────────────────────────
const fmtFull = (n: number): string => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtShort = (n: number): string => {
  const v = n || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
};
const pct = (part: number, whole: number): string => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const fmtDetailDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  const dt = new Date((d.length <= 10 ? d + 'T00:00:00' : d));
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const daysBetween = (from: string | null | undefined, to: string | null | undefined): number | null => {
  if (!from || !to) return null;
  const a = new Date(from), b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 864e5));
};

// ── Filter chips (self-contained, matching CRM dashboard style) ─────────────
function FilterChip({ label, options, selected, onChange, color }: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const active = selected.length > 0;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `${label}: ${selected.length === 1 ? selected[0] : selected.length}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[190px] max-h-[240px] overflow-y-auto py-1">
            {options.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No options</div>}
            {options.map((opt, i) => (
              <label key={`${opt}-${i}`} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: color }} />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BMFilterChip({ selected, onChange, options, color }: {
  selected: string[]; onChange: (v: string[]) => void;
  options: AvailableBM[]; color: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const active = selected.length > 0;
  const visible = search.trim()
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.contact.includes(search))
    : options;
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c]);
  const labels = selected.map(c => options.find(o => o.contact === c)?.name || c).join(', ');
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `BM: ${selected.length === 1 ? labels : selected.length}` : 'BM'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[210px] flex flex-col" style={{ maxHeight: 270 }}>
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
              <input autoFocus type="text" placeholder="Search BM…" value={search}
                onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 outline-none bg-white" />
            </div>
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>}
              {visible.map((o, i) => (
                <label key={o.contact || i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input type="checkbox" checked={selected.includes(o.contact)} onChange={() => toggle(o.contact)} style={{ accentColor: color }} />
                  <span>{o.name}</span>
                  {o.contact && <span className="text-gray-400 font-normal ml-auto">{o.contact}</span>}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const fmtRangeVal = (n: number): string => {
  if (n >= 100000) { const l = n / 100000; return `₹${Number.isInteger(l) ? l : l.toFixed(1)}L`; }
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${Math.round(n)}`;
};

function CartValueRangeChip({ gt, lt, onChange, color }: {
  gt: string; lt: string; onChange: (gt: string, lt: string) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(gt || lt);
  const display = active
    ? `Cart Value: ${gt ? fmtRangeVal(Number(gt)) : '₹0'} – ${lt ? fmtRangeVal(Number(lt)) : '∞'}`
    : 'Cart Value';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Cart Value (₹)</div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Min (greater than)</label>
            <input type="number" inputMode="numeric" min={0} step={1000} value={gt} placeholder="0"
              onChange={e => onChange(e.target.value, lt)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Max (less than)</label>
            <input type="number" inputMode="numeric" min={0} step={1000} value={lt} placeholder="No limit"
              onChange={e => onChange(gt, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            {active && (
              <button onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50">
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DaysRangeChip({ gt, lt, onChange, color }: {
  gt: string; lt: string; onChange: (gt: string, lt: string) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(gt || lt);
  const display = active
    ? `Days in Pipeline: ${gt || '0'} – ${lt || '∞'}`
    : 'Days in Pipeline';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Days in Pipeline</div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Min (at least)</label>
            <input type="number" inputMode="numeric" min={0} step={1} value={gt} placeholder="0"
              onChange={e => onChange(e.target.value, lt)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Max (at most)</label>
            <input type="number" inputMode="numeric" min={0} step={1} value={lt} placeholder="No limit"
              onChange={e => onChange(gt, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            {active && (
              <button onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50">
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const fmtChipDate = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

function DateRangeChip({ from, to, onChange, label, color }: {
  from: string; to: string; onChange: (from: string, to: string) => void; label: string; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(from && to);
  const today = new Date().toISOString().split('T')[0];
  const display = active ? `${fmtChipDate(from)} – ${fmtChipDate(to)}` : label;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        📅 {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">{label}</div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">From</label>
            <input type="date" value={from} max={to || today} onChange={e => onChange(e.target.value, to)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">To</label>
            <input type="date" value={to} min={from || undefined} max={today} onChange={e => onChange(from, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            {(from || to) && (
              <button onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50">
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Aggregated shapes ───────────────────────────────────────────────────────
type Grp = 'Category' | 'Retail' | 'Other';
type ReasonMap = Record<Grp, Record<string, number>>;

interface BranchSummary {
  branch: string;
  totalCount: number; totalValue: number;
  activeCount: number; activeValue: number;
  wonCount: number; wonValue: number;
  lostCount: number; lostValue: number;
  groupCount: Record<Grp, number>;
  groupValue: Record<Grp, number>;
  reasonCount?: ReasonMap;
  reasonValue?: ReasonMap;
}

const emptyGroups = () => ({ Category: 0, Retail: 0, Other: 0 });
const emptyReasons = (): ReasonMap => ({ Category: {}, Retail: {}, Other: {} });

const DETAIL_PAGE_SIZE = 100;
const DETAIL_MAX_PAGES = 30;

const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const triggerDownload = (rows: string[][], filename: string) => {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

// ── Main component ──────────────────────────────────────────────────────────
export default function OrderLostDashboard({ branches, allowedBranches }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptionsKey = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ').join(',');
  const branchOptions = useMemo(() => (branchOptionsKey ? branchOptionsKey.split(',') : []), [branchOptionsKey]);

  // Summary panel filters (independent)
  const [sBranch, setSBranch] = useState<string[]>([]);
  const [sBm, setSBm] = useState<string[]>([]);
  const [sCategory, setSCategory] = useState<string[]>([]);
  const [sCartGt, setSCartGt] = useState<string>('');
  const [sCartLt, setSCartLt] = useState<string>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  // Detail panel filters (independent)
  const [dBranch, setDBranch] = useState<string[]>([]);
  const [dBm, setDBm] = useState<string[]>([]);
  const [dCategory, setDCategory] = useState<string[]>([]);
  const [dCartGt, setDCartGt] = useState<string>('');
  const [dCartLt, setDCartLt] = useState<string>('');
  const [lostReasonFilter, setLostReasonFilter] = useState<string[]>([]);
  const [lostFrom, setLostFrom] = useState('');
  const [lostTo, setLostTo] = useState('');
  const [dDaysGt, setDDaysGt] = useState<string>('');
  const [dDaysLt, setDDaysLt] = useState<string>('');

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [bmList, setBmList] = useState<AvailableBM[]>([]);

  const [summary, setSummary] = useState<BranchSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [detail, setDetail] = useState<CRMLeadRow[]>([]);
  const [detailCount, setDetailCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(true);
  const [csvBusy, setCsvBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailPage, setDetailPage] = useState(1);

  const toggleExpand = (key: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const summaryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  // Stable string derivations — used as primitive effect deps so the loaders
  // never re-fire on unrelated re-renders (previously caused an infinite loop).
  const resolveBranches = (filter: string[]) => {
    if (filter.length) return isRestricted ? filter.filter(b => branchOptions.includes(b)) : filter;
    return branchOptions;
  };

  // Summary params
  const sEffectiveBranches = useMemo(() => resolveBranches(sBranch), [sBranch, isRestricted, branchOptions]);
  const sBranchesParam = sEffectiveBranches.join(',');
  const sBmParam = sBm.length ? sBm.join(',') : undefined;
  const sCategoryParam = sCategory.length ? sCategory.join(',') : undefined;
  const sCartGtNum = sCartGt ? Number(sCartGt) : undefined;
  const sCartLtNum = sCartLt ? Number(sCartLt) : undefined;

  // Detail params
  const dEffectiveBranches = useMemo(() => resolveBranches(dBranch), [dBranch, isRestricted, branchOptions]);
  const dBranchesParam = dEffectiveBranches.join(',');
  // Only constrain by branch server-side when it's a real subset (not "all").
  const detailBranchParam = (dEffectiveBranches.length && dEffectiveBranches.length < branchOptions.length)
    ? dBranchesParam : '';
  const dBmParam = dBm.length ? dBm.join(',') : undefined;
  const dCategoryParam = dCategory.length ? dCategory.join(',') : undefined;
  const dCartGtNum = dCartGt ? Number(dCartGt) : undefined;
  const dCartLtNum = dCartLt ? Number(dCartLt) : undefined;

  // BM options loaded once across all accessible branches; each panel selects independently.
  useEffect(() => {
    const all = branchOptions.join(',');
    fetchAvailableBMs(all ? all.split(',') : undefined)
      .then(setBmList).catch(() => setBmList([]));
  }, [branchOptionsKey]);

  const detailQuery = useMemo(() => ({
    status: 'Order Lost' as const,
    branch: detailBranchParam || undefined,
    bm: dBmParam,
    category: dCategoryParam,
    cartValueGt: dCartGtNum,
    cartValueLt: dCartLtNum,
    lostFrom: lostFrom || undefined,
    lostTo: lostTo || undefined,
    sortBy: 'createdAt' as const,
    sortDir: 'desc' as const,
  }), [detailBranchParam, dBmParam, dCategoryParam, dCartGtNum, dCartLtNum, lostFrom, lostTo]);

  // ── Summary: one server-aggregated call (per-branch buckets + reason groups)
  useEffect(() => {
    if (summaryDebounce.current) clearTimeout(summaryDebounce.current);
    summaryDebounce.current = setTimeout(() => {
      setSummaryLoading(true);
      fetchOrderLostSummary({
        branch: sBranchesParam ? sBranchesParam.split(',') : undefined,
        bm: sBmParam ? sBmParam.split(',') : undefined,
        category: sCategoryParam ? sCategoryParam.split(',') : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        cartValueGt: sCartGtNum,
        cartValueLt: sCartLtNum,
      })
        .then((rows: OrderLostBranchSummary[]) => setSummary(rows as BranchSummary[]))
        .catch(() => setSummary([]))
        .finally(() => setSummaryLoading(false));
    }, 400);
    return () => { if (summaryDebounce.current) clearTimeout(summaryDebounce.current); };
  }, [sBranchesParam, sBmParam, sCategoryParam, createdFrom, createdTo, sCartGtNum, sCartLtNum]);

  // Reset to first page whenever the query filters change.
  useEffect(() => { setDetailPage(1); }, [detailQuery]);

  // ── Detail: paginated; CSV export still pulls the full set on demand ──────
  const [detailTotalPages, setDetailTotalPages] = useState(1);
  useEffect(() => {
    if (detailDebounce.current) clearTimeout(detailDebounce.current);
    detailDebounce.current = setTimeout(() => {
      setDetailLoading(true);
      fetchCRMLeads({ page: detailPage, pageSize: DETAIL_PAGE_SIZE, ...detailQuery })
        .then(res => { setDetail(res.results); setDetailCount(res.count); setDetailTotalPages(res.totalPages || 1); })
        .catch(() => { setDetail([]); setDetailCount(0); setDetailTotalPages(1); })
        .finally(() => setDetailLoading(false));
    }, 400);
    return () => { if (detailDebounce.current) clearTimeout(detailDebounce.current); };
  }, [detailQuery, detailPage]);

  // ── Derived totals column ─────────────────────────────────────────────────
  const totals = useMemo<BranchSummary>(() => {
    const acc: BranchSummary = {
      branch: 'TOTAL', totalCount: 0, totalValue: 0, activeCount: 0, activeValue: 0,
      wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0,
      groupCount: emptyGroups(), groupValue: emptyGroups(),
      reasonCount: emptyReasons(), reasonValue: emptyReasons(),
    };
    for (const b of summary) {
      acc.totalCount += b.totalCount; acc.totalValue += b.totalValue;
      acc.activeCount += b.activeCount; acc.activeValue += b.activeValue;
      acc.wonCount += b.wonCount; acc.wonValue += b.wonValue;
      acc.lostCount += b.lostCount; acc.lostValue += b.lostValue;
      (['Category', 'Retail', 'Other'] as const).forEach(g => {
        acc.groupCount[g] += b.groupCount[g];
        acc.groupValue[g] += b.groupValue[g];
        Object.entries(b.reasonCount?.[g] || {}).forEach(([k, v]) => {
          acc.reasonCount![g][k] = (acc.reasonCount![g][k] || 0) + v;
        });
        Object.entries(b.reasonValue?.[g] || {}).forEach(([k, v]) => {
          acc.reasonValue![g][k] = (acc.reasonValue![g][k] || 0) + v;
        });
      });
    }
    return acc;
  }, [summary]);

  // ── Detail client-side filtering (lost reason + days in pipeline) ─────────
  const dDaysGtNum = dDaysGt ? Number(dDaysGt) : undefined;
  const dDaysLtNum = dDaysLt ? Number(dDaysLt) : undefined;
  const matchesDetailClientFilters = (r: CRMLeadRow, wanted: Set<string> | null): boolean => {
    if (wanted && !wanted.has(normalizeReason(r.lostReason))) return false;
    if (dDaysGtNum != null || dDaysLtNum != null) {
      const days = daysBetween(r.createdAt, r.lostMarkDate);
      if (days == null) return false;
      if (dDaysGtNum != null && days < dDaysGtNum) return false;
      if (dDaysLtNum != null && days > dDaysLtNum) return false;
    }
    return true;
  };
  const filteredDetail = useMemo(() => {
    const hasClientFilter = lostReasonFilter.length > 0 || dDaysGtNum != null || dDaysLtNum != null;
    if (!hasClientFilter) return detail;
    const wanted = lostReasonFilter.length ? new Set(lostReasonFilter.map(normalizeReason)) : null;
    return detail.filter(r => matchesDetailClientFilters(r, wanted));
  }, [detail, lostReasonFilter, dDaysGtNum, dDaysLtNum]);

  const latestComment = (r: CRMLeadRow): string => {
    if (!r.remarks?.length) return '';
    const sorted = [...r.remarks].sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return sorted[0]?.text ?? '';
  };

  const resetSummary = () => {
    setSBranch([]); setSBm([]); setSCategory([]); setSCartGt(''); setSCartLt(''); setCreatedFrom(''); setCreatedTo('');
  };
  const resetDetail = () => {
    setDBranch([]); setDBm([]); setDCategory([]); setDCartGt(''); setDCartLt('');
    setLostReasonFilter([]); setLostFrom(''); setLostTo(''); setDDaysGt(''); setDDaysLt('');
  };

  const downloadSummaryCsv = () => {
    const head = ['Metric', ...summary.map(b => b.branch), 'TOTAL'];
    const cols = [...summary, totals];
    const rows: string[][] = [head];
    const line = (label: string, fn: (b: BranchSummary) => string) => rows.push([label, ...cols.map(fn)]);
    line('Total Leads', b => String(b.totalCount));
    line('Active Leads', b => String(b.activeCount));
    line('Orders Won', b => String(b.wonCount));
    line('Total Orders Lost', b => String(b.lostCount));
    line('Category Issues', b => String(b.groupCount.Category));
    line('Retail Issues', b => String(b.groupCount.Retail));
    line('Other Issues', b => String(b.groupCount.Other));
    line('Total Sales Value', b => String(Math.round(b.wonValue)));
    line('Pipeline Value', b => String(Math.round(b.activeValue)));
    line('Total Value Lost', b => String(Math.round(b.lostValue)));
    line('Category Issues — Value', b => String(Math.round(b.groupValue.Category)));
    line('Retail Issues — Value', b => String(Math.round(b.groupValue.Retail)));
    line('Other Issues — Value', b => String(Math.round(b.groupValue.Other)));
    triggerDownload(rows, 'order-lost-summary.csv');
  };

  // Detail table shows only page 1; the CSV pulls the full result set on demand.
  const downloadDetailCsv = async () => {
    setCsvBusy(true);
    try {
      const all: CRMLeadRow[] = [];
      for (let page = 1; page <= DETAIL_MAX_PAGES; page++) {
        const res = await fetchCRMLeads({ page, pageSize: DETAIL_PAGE_SIZE, ...detailQuery });
        all.push(...res.results);
        if (page >= (res.totalPages || 1)) break;
      }
      const wanted = lostReasonFilter.length ? new Set(lostReasonFilter.map(normalizeReason)) : null;
      const rowsData = (wanted || dDaysGtNum != null || dDaysLtNum != null)
        ? all.filter(r => matchesDetailClientFilters(r, wanted))
        : all;
      const head = ['Client Name', 'Phone', 'Store', 'BM', 'Categories', 'Cart Value', 'Cart Created', 'Lost Mark Date', 'Days in Pipeline', 'Lost Reason', 'Comments', 'Property Type'];
      const rows: string[][] = [head];
      for (const r of rowsData) {
        const days = daysBetween(r.createdAt, r.lostMarkDate);
        rows.push([
          r.clientName ?? '', r.clientPhone ?? '', r.branch ?? '', r.assignedTo ?? '',
          r.cartItems ?? '', String(Math.round(r.cartValue || 0)),
          fmtDetailDate(r.createdAt), fmtDetailDate(r.lostMarkDate),
          days != null ? `${days}d` : '—', r.lostReason ?? '', latestComment(r), r.propertyType ?? '',
        ]);
      }
      triggerDownload(rows, 'lost-clients-detail.csv');
    } finally {
      setCsvBusy(false);
    }
  };

  const cols = summary; // branch columns in load order

  // ── Row renderers for summary ─────────────────────────────────────────────
  const CountRow = ({ label, value, share, sub, indent, danger }: {
    label: string; value: (b: BranchSummary) => number; share?: (b: BranchSummary) => string;
    sub?: (b: BranchSummary) => string; indent?: boolean; danger?: boolean;
  }) => (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60">
      <td className={`px-4 py-2.5 text-[13px] ${indent ? 'pl-8 text-gray-500' : 'font-medium text-gray-800'} ${danger ? 'text-red-600 font-semibold' : ''}`}>
        {indent && <span className="text-gray-300 mr-1.5">▸</span>}{danger && <span className="mr-1">⚠</span>}{label}
      </td>
      {[...cols, totals].map((b, i) => (
        <td key={i} className={`px-4 py-2.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
          <div className={`text-[13px] ${indent ? 'text-gray-700' : 'font-semibold text-gray-900'} font-mono`}>{value(b).toLocaleString('en-IN')}</div>
          {(share || sub) && <div className="text-[10px] text-gray-400 font-mono">{sub ? sub(b) : share!(b)}</div>}
        </td>
      ))}
    </tr>
  );

  const ValueRow = ({ label, value, sub, indent, danger }: {
    label: string; value: (b: BranchSummary) => number; sub?: (b: BranchSummary) => string;
    indent?: boolean; danger?: boolean;
  }) => (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60">
      <td className={`px-4 py-2.5 text-[13px] ${indent ? 'pl-8 text-gray-500' : 'font-medium text-gray-800'} ${danger ? 'text-red-600 font-semibold' : ''}`}>
        {indent && <span className="text-gray-300 mr-1.5">▸</span>}{danger && <span className="mr-1">⚠</span>}{label}
      </td>
      {[...cols, totals].map((b, i) => (
        <td key={i} className={`px-4 py-2.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
          <div className={`text-[13px] ${indent ? 'text-gray-700' : 'font-semibold text-gray-900'} font-mono`}>{indent ? fmtShort(value(b)) : fmtFull(value(b))}</div>
          {sub && <div className="text-[10px] text-gray-400 font-mono">{sub(b)}</div>}
        </td>
      ))}
    </tr>
  );

  // Union of reason labels present for a group across all branches + total.
  const reasonKeys = (group: Grp, kind: 'count' | 'value'): string[] => {
    const set = new Set<string>();
    [...cols, totals].forEach(b => {
      const src = kind === 'count' ? b.reasonCount : b.reasonValue;
      Object.keys(src?.[group] || {}).forEach(k => set.add(k));
    });
    return [...set].sort();
  };

  // Expandable group row: header (clickable) + per-reason sub-rows when open.
  const GroupRows = ({ group, label, kind }: { group: Grp; label: string; kind: 'count' | 'value' }) => {
    const key = `${kind}:${group}`;
    const open = expanded.has(key);
    const groupTotal = (b: BranchSummary) => kind === 'count' ? b.groupCount[group] : b.groupValue[group];
    const denom = (b: BranchSummary) => kind === 'count' ? b.lostCount : b.lostValue;
    const suffix = kind === 'count' ? 'of lost' : 'of value lost';
    const reasonVal = (b: BranchSummary, reason: string) =>
      (kind === 'count' ? b.reasonCount : b.reasonValue)?.[group]?.[reason] || 0;
    const fmtGroup = (n: number) => kind === 'count' ? n.toLocaleString('en-IN') : fmtShort(n);
    return (
      <>
        <tr className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer select-none" onClick={() => toggleExpand(key)}>
          <td className="px-4 py-2.5 text-[13px] pl-8 text-gray-500">
            <span className="text-gray-400 mr-1.5 inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>{label}
          </td>
          {[...cols, totals].map((b, i) => (
            <td key={i} className={`px-4 py-2.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
              <div className="text-[13px] text-gray-700 font-mono">{fmtGroup(groupTotal(b))}</div>
              <div className="text-[10px] text-gray-400 font-mono">{`${pct(groupTotal(b), denom(b))} ${suffix}`}</div>
            </td>
          ))}
        </tr>
        {open && reasonKeys(group, kind).map(reason => (
          <tr key={reason} className="border-b border-gray-50 bg-blue-50/20">
            <td className="px-4 py-1.5 text-[12px] pl-14 text-gray-400">{reason}</td>
            {[...cols, totals].map((b, i) => (
              <td key={i} className={`px-4 py-1.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
                <div className="text-[12px] text-gray-500 font-mono">{fmtGroup(reasonVal(b, reason))}</div>
              </td>
            ))}
          </tr>
        ))}
        {open && reasonKeys(group, kind).length === 0 && (
          <tr className="border-b border-gray-50 bg-blue-50/20">
            <td colSpan={cols.length + 2} className="px-4 py-1.5 pl-14 text-[11px] text-gray-300">No breakdown</td>
          </tr>
        )}
      </>
    );
  };

  return (
    <div className="px-3 sm:px-6 py-4 space-y-6">
      {/* ── Summary Table ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Summary Table</h2>
            <p className="text-[11px] text-gray-400">Total Leads = deal-ticket leads (one row per deal ticket) · date range applies to <span className="font-semibold text-gray-500">Cart Created</span> · Store, BM &amp; Category filters apply</p>
          </div>
          <button onClick={downloadSummaryCsv}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-black">
            <Download size={13} /> Download CSV
          </button>
        </div>

        {/* Summary filter bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm mb-3">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
          <FilterChip label="Store" options={branchOptions} selected={sBranch}
            onChange={v => { setSBranch(v); setSBm([]); }} color="#3B82F6" />
          <BMFilterChip selected={sBm} onChange={setSBm} options={bmList} color="#8B5CF6" />
          <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={sCategory}
            onChange={setSCategory} color="#10B981" />
          <CartValueRangeChip gt={sCartGt} lt={sCartLt}
            onChange={(g, l) => { setSCartGt(g); setSCartLt(l); }} color="#F59E0B" />
          <DateRangeChip from={createdFrom} to={createdTo} onChange={(f, t) => { setCreatedFrom(f); setCreatedTo(t); }}
            label="Cart Created" color="#0EA5E9" />
          <button onClick={resetSummary} className="ml-auto text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer">Reset all</button>
        </div>
        <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {summaryLoading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Metric</th>
                  {cols.map(b => (
                    <th key={b.branch} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{b.branch}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/60">Total</th>
                </tr>
              </thead>
              <tbody>
                {!summaryLoading && cols.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-10 text-center text-[13px] text-gray-400">No data for the selected filters</td></tr>
                )}
                {cols.length > 0 && <>
                  <tr className="bg-gray-50"><td colSpan={cols.length + 2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Orders — Count</td></tr>
                  <CountRow label="Total Leads" value={b => b.totalCount} />
                  <CountRow label="Active Leads" value={b => b.activeCount} sub={b => pct(b.activeCount, b.totalCount)} />
                  <CountRow label="Orders Won" value={b => b.wonCount} sub={b => pct(b.wonCount, b.totalCount)} />
                  <CountRow label="Total Orders Lost" value={b => b.lostCount} sub={b => pct(b.lostCount, b.totalCount)} danger />
                  <GroupRows group="Category" label="Category Issues" kind="count" />
                  <GroupRows group="Retail" label="Retail Issues" kind="count" />
                  <GroupRows group="Other" label="Other Issues" kind="count" />

                  <tr className="bg-gray-50"><td colSpan={cols.length + 2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Value (₹) — Cart Value</td></tr>
                  <ValueRow label="Total Sales Value" value={b => b.wonValue} />
                  <ValueRow label="Pipeline Value" value={b => b.activeValue} />
                  <ValueRow label="Total Value Lost" value={b => b.lostValue} danger />
                  <GroupRows group="Category" label="Category Issues — Value" kind="value" />
                  <GroupRows group="Retail" label="Retail Issues — Value" kind="value" />
                  <GroupRows group="Other" label="Other Issues — Value" kind="value" />
                </>}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">% shares exclude &ldquo;Order Closed Already&rdquo; (non-loss). Values in Indian number format (₹).</p>
      </section>

      {/* ── Lost Clients Detail ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Lost Clients Detail</h2>
            <p className="text-[11px] text-gray-400">Date range applies to <span className="font-semibold text-gray-500">Lost Mark Date</span> — clients marked lost in the selected window ·
              {' '}{detailLoading ? 'loading…' : `${detailCount.toLocaleString('en-IN')} clients`}</p>
          </div>
          <button onClick={downloadDetailCsv} disabled={csvBusy || detailLoading}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-black disabled:opacity-50">
            <Download size={13} /> {csvBusy ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>

        {/* Detail filter bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm mb-3">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
          <FilterChip label="Store" options={branchOptions} selected={dBranch}
            onChange={v => { setDBranch(v); setDBm([]); }} color="#3B82F6" />
          <BMFilterChip selected={dBm} onChange={setDBm} options={bmList} color="#8B5CF6" />
          <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={dCategory}
            onChange={setDCategory} color="#10B981" />
          <CartValueRangeChip gt={dCartGt} lt={dCartLt}
            onChange={(g, l) => { setDCartGt(g); setDCartLt(l); }} color="#F59E0B" />
          <FilterChip label="Lost Reason" options={LOST_REASON_OPTIONS} selected={lostReasonFilter}
            onChange={setLostReasonFilter} color="#EF4444" />
          <DateRangeChip from={lostFrom} to={lostTo} onChange={(f, t) => { setLostFrom(f); setLostTo(t); }}
            label="Lost Mark Date" color="#DC2626" />
          <DaysRangeChip gt={dDaysGt} lt={dDaysLt}
            onChange={(g, l) => { setDDaysGt(g); setDDaysLt(l); }} color="#0EA5E9" />
          <button onClick={resetDetail} className="ml-auto text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer">Reset all</button>
        </div>
        {!detailLoading && (lostReasonFilter.length > 0 || dDaysGtNum != null || dDaysLtNum != null) && (
          <div className="mb-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
            {lostReasonFilter.length > 0 && (dDaysGtNum != null || dDaysLtNum != null) ? 'Lost Reason and Days in Pipeline filters are' : lostReasonFilter.length > 0 ? 'Lost Reason filter is' : 'Days in Pipeline filter is'} applied to this page only — download the CSV for the full filtered list.
          </div>
        )}
        <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {detailLoading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-white z-[1]">
                <tr className="border-b border-gray-200">
                  {['#', 'Client Name', 'Phone', 'Store', 'BM', 'Categories', 'Cart Value', 'Cart Created', 'Lost Mark Date', 'Days in Pipeline', 'Lost Reason', 'Comments', 'Property Type'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!detailLoading && filteredDetail.length === 0 && (
                  <tr><td colSpan={13} className="px-4 py-10 text-center text-[13px] text-gray-400">No lost clients for the selected filters</td></tr>
                )}
                {filteredDetail.map((r, i) => {
                  const days = daysBetween(r.createdAt, r.lostMarkDate);
                  const cats = (r.cartItems || '').split(',').map(s => s.trim()).filter(Boolean);
                  return (
                    <tr key={`${r.id || 'row'}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                      <td className="px-3 py-2.5 text-gray-400 font-mono">{(detailPage - 1) * DETAIL_PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{r.clientName || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-500 whitespace-nowrap">{r.clientPhone || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.branch || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.assignedTo || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {cats.length ? cats.map((c, ci) => (
                            <span key={ci} className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded">{c}</span>
                          )) : <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{fmtFull(r.cartValue || 0)}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDetailDate(r.createdAt)}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDetailDate(r.lostMarkDate)}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 whitespace-nowrap">{days != null ? `${days}d` : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">{r.lostReason || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 max-w-[280px]"><div className="line-clamp-3">{latestComment(r) || '—'}</div></td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.propertyType || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!detailLoading && detailCount > 0 && (
          <div className="flex items-center justify-between mt-2 text-[12px] text-gray-500">
            <span>
              Showing {((detailPage - 1) * DETAIL_PAGE_SIZE + 1).toLocaleString('en-IN')}–{Math.min(detailPage * DETAIL_PAGE_SIZE, detailCount).toLocaleString('en-IN')} of {detailCount.toLocaleString('en-IN')}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setDetailPage(p => Math.max(1, p - 1))} disabled={detailPage <= 1}
                className="px-2.5 py-1 rounded-md border border-gray-200 bg-white cursor-pointer hover:border-gray-400 disabled:opacity-40 disabled:cursor-default">Prev</button>
              <span className="px-2 tabular-nums">Page {detailPage} / {detailTotalPages}</span>
              <button onClick={() => setDetailPage(p => Math.min(detailTotalPages, p + 1))} disabled={detailPage >= detailTotalPages}
                className="px-2.5 py-1 rounded-md border border-gray-200 bg-white cursor-pointer hover:border-gray-400 disabled:opacity-40 disabled:cursor-default">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

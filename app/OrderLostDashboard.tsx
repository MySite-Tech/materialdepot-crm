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

const CART_VALUE_OPTIONS: { label: string; gt: number }[] = [
  { label: '≥ ₹50k', gt: 50000 },
  { label: '≥ ₹1L', gt: 100000 },
  { label: '≥ ₹3L', gt: 300000 },
  { label: '≥ ₹5L', gt: 500000 },
];

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

function SingleSelectChip({ label, options, selected, onChange, color }: {
  label: string; options: { label: string; value: string }[];
  selected: string; onChange: (v: string) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!selected;
  const current = options.find(o => o.value === selected);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `${label}: ${current?.label ?? selected}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[160px] py-1">
            {selected && (
              <div className="px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 cursor-pointer" onClick={() => { onChange(''); setOpen(false); }}>Clear</div>
            )}
            {options.map(o => (
              <div key={o.value}
                className={`px-3 py-1.5 text-[12px] cursor-pointer hover:bg-gray-50 ${o.value === selected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.label}
              </div>
            ))}
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
interface BranchSummary {
  branch: string;
  totalCount: number; totalValue: number;
  activeCount: number; activeValue: number;
  wonCount: number; wonValue: number;
  lostCount: number; lostValue: number;
  groupCount: Record<'Category' | 'Retail' | 'Other', number>;
  groupValue: Record<'Category' | 'Retail' | 'Other', number>;
}

const emptyGroups = () => ({ Category: 0, Retail: 0, Other: 0 });

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

  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [cartValueGt, setCartValueGt] = useState<string>('');
  const [lostReasonFilter, setLostReasonFilter] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [lostFrom, setLostFrom] = useState('');
  const [lostTo, setLostTo] = useState('');

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [bmList, setBmList] = useState<AvailableBM[]>([]);

  const [summary, setSummary] = useState<BranchSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [detail, setDetail] = useState<CRMLeadRow[]>([]);
  const [detailCount, setDetailCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(true);
  const [csvBusy, setCsvBusy] = useState(false);

  const summaryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  // Stable string derivations — used as primitive effect deps so the loaders
  // never re-fire on unrelated re-renders (previously caused an infinite loop).
  const effectiveBranches = useMemo(() => {
    if (branchFilter.length) {
      return isRestricted ? branchFilter.filter(b => branchOptions.includes(b)) : branchFilter;
    }
    return branchOptions;
  }, [branchFilter, isRestricted, branchOptions]);

  const branchesParam = effectiveBranches.join(',');
  // Only constrain by branch server-side when it's a real subset (not "all").
  const detailBranchParam = (effectiveBranches.length && effectiveBranches.length < branchOptions.length)
    ? branchesParam : '';
  const bmParam = bmFilter.length ? bmFilter.join(',') : undefined;
  const categoryParam = categoryFilter.length ? categoryFilter.join(',') : undefined;
  const cartGt = cartValueGt ? Number(cartValueGt) : undefined;

  useEffect(() => {
    fetchAvailableBMs(branchesParam ? branchesParam.split(',') : undefined)
      .then(setBmList).catch(() => setBmList([]));
  }, [branchesParam]);

  const detailQuery = useMemo(() => ({
    status: 'Order Lost' as const,
    branch: detailBranchParam || undefined,
    bm: bmParam,
    category: categoryParam,
    cartValueGt: cartGt,
    closureFrom: lostFrom || undefined,
    closureTo: lostTo || undefined,
    sortBy: 'createdAt' as const,
    sortDir: 'desc' as const,
  }), [detailBranchParam, bmParam, categoryParam, cartGt, lostFrom, lostTo]);

  // ── Summary: one server-aggregated call (per-branch buckets + reason groups)
  useEffect(() => {
    if (summaryDebounce.current) clearTimeout(summaryDebounce.current);
    summaryDebounce.current = setTimeout(() => {
      setSummaryLoading(true);
      fetchOrderLostSummary({
        branch: branchesParam ? branchesParam.split(',') : undefined,
        bm: bmParam ? bmParam.split(',') : undefined,
        category: categoryParam ? categoryParam.split(',') : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        cartValueGt: cartGt,
      })
        .then((rows: OrderLostBranchSummary[]) => setSummary(rows as BranchSummary[]))
        .catch(() => setSummary([]))
        .finally(() => setSummaryLoading(false));
    }, 400);
    return () => { if (summaryDebounce.current) clearTimeout(summaryDebounce.current); };
  }, [branchesParam, bmParam, categoryParam, createdFrom, createdTo, cartGt]);

  // ── Detail: first page only for display; full set fetched on CSV export ───
  useEffect(() => {
    if (detailDebounce.current) clearTimeout(detailDebounce.current);
    detailDebounce.current = setTimeout(() => {
      setDetailLoading(true);
      fetchCRMLeads({ page: 1, pageSize: DETAIL_PAGE_SIZE, ...detailQuery })
        .then(res => { setDetail(res.results); setDetailCount(res.count); })
        .catch(() => { setDetail([]); setDetailCount(0); })
        .finally(() => setDetailLoading(false));
    }, 400);
    return () => { if (detailDebounce.current) clearTimeout(detailDebounce.current); };
  }, [detailQuery]);

  // ── Derived totals column ─────────────────────────────────────────────────
  const totals = useMemo<BranchSummary>(() => {
    const acc: BranchSummary = {
      branch: 'TOTAL', totalCount: 0, totalValue: 0, activeCount: 0, activeValue: 0,
      wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0,
      groupCount: emptyGroups(), groupValue: emptyGroups(),
    };
    for (const b of summary) {
      acc.totalCount += b.totalCount; acc.totalValue += b.totalValue;
      acc.activeCount += b.activeCount; acc.activeValue += b.activeValue;
      acc.wonCount += b.wonCount; acc.wonValue += b.wonValue;
      acc.lostCount += b.lostCount; acc.lostValue += b.lostValue;
      (['Category', 'Retail', 'Other'] as const).forEach(g => {
        acc.groupCount[g] += b.groupCount[g];
        acc.groupValue[g] += b.groupValue[g];
      });
    }
    return acc;
  }, [summary]);

  // ── Detail client-side filtering (lost reason) ────────────────────────────
  const filteredDetail = useMemo(() => {
    if (!lostReasonFilter.length) return detail;
    const wanted = new Set(lostReasonFilter.map(normalizeReason));
    return detail.filter(r => wanted.has(normalizeReason(r.lostReason)));
  }, [detail, lostReasonFilter]);

  const latestComment = (r: CRMLeadRow): string => {
    if (!r.remarks?.length) return '';
    const sorted = [...r.remarks].sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return sorted[0]?.text ?? '';
  };

  const resetAll = () => {
    setBranchFilter([]); setBmFilter([]); setCategoryFilter([]); setCartValueGt('');
    setLostReasonFilter([]); setCreatedFrom(''); setCreatedTo(''); setLostFrom(''); setLostTo('');
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
      const rowsData = wanted ? all.filter(r => wanted.has(normalizeReason(r.lostReason))) : all;
      const head = ['Client Name', 'Phone', 'Store', 'BM', 'Categories', 'Cart Value', 'Cart Created', 'Lost Mark Date', 'Days in Pipeline', 'Lost Reason', 'Comments', 'Property Type'];
      const rows: string[][] = [head];
      for (const r of rowsData) {
        const days = daysBetween(r.createdAt, r.closureDate);
        rows.push([
          r.clientName ?? '', r.clientPhone ?? '', r.branch ?? '', r.assignedTo ?? '',
          r.cartItems ?? '', String(Math.round(r.cartValue || 0)),
          fmtDetailDate(r.createdAt), fmtDetailDate(r.closureDate),
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

  return (
    <div className="px-3 sm:px-6 py-4 space-y-6">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip label="Store" options={branchOptions} selected={branchFilter}
          onChange={v => { setBranchFilter(v); setBmFilter([]); }} color="#3B82F6" />
        <BMFilterChip selected={bmFilter} onChange={setBmFilter} options={bmList} color="#8B5CF6" />
        <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={categoryFilter}
          onChange={setCategoryFilter} color="#10B981" />
        <SingleSelectChip label="Cart Value" options={CART_VALUE_OPTIONS.map(o => ({ label: o.label, value: String(o.gt) }))}
          selected={cartValueGt} onChange={setCartValueGt} color="#F59E0B" />
        <FilterChip label="Lost Reason" options={LOST_REASON_OPTIONS} selected={lostReasonFilter}
          onChange={setLostReasonFilter} color="#EF4444" />
        <DateRangeChip from={createdFrom} to={createdTo} onChange={(f, t) => { setCreatedFrom(f); setCreatedTo(t); }}
          label="Cart Created" color="#0EA5E9" />
        <DateRangeChip from={lostFrom} to={lostTo} onChange={(f, t) => { setLostFrom(f); setLostTo(t); }}
          label="Lost Mark Date" color="#DC2626" />
        <button onClick={resetAll} className="ml-auto text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer">Reset all</button>
      </div>

      {/* ── Summary Table ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Summary Table</h2>
            <p className="text-[11px] text-gray-400">Date range applies to <span className="font-semibold text-gray-500">Cart Created Date</span> · Store, BM &amp; Category filters apply</p>
          </div>
          <button onClick={downloadSummaryCsv}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-black">
            <Download size={13} /> Download CSV
          </button>
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
                  <CountRow label="Category Issues" value={b => b.groupCount.Category} sub={b => `${pct(b.groupCount.Category, b.lostCount)} of lost`} indent />
                  <CountRow label="Retail Issues" value={b => b.groupCount.Retail} sub={b => `${pct(b.groupCount.Retail, b.lostCount)} of lost`} indent />
                  <CountRow label="Other Issues" value={b => b.groupCount.Other} sub={b => `${pct(b.groupCount.Other, b.lostCount)} of lost`} indent />

                  <tr className="bg-gray-50"><td colSpan={cols.length + 2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Value (₹) — Cart Value</td></tr>
                  <ValueRow label="Total Sales Value" value={b => b.wonValue} />
                  <ValueRow label="Pipeline Value" value={b => b.activeValue} />
                  <ValueRow label="Total Value Lost" value={b => b.lostValue} danger />
                  <ValueRow label="Category Issues — Value" value={b => b.groupValue.Category} sub={b => `${pct(b.groupValue.Category, b.lostValue)} of value lost`} indent />
                  <ValueRow label="Retail Issues — Value" value={b => b.groupValue.Retail} sub={b => `${pct(b.groupValue.Retail, b.lostValue)} of value lost`} indent />
                  <ValueRow label="Other Issues — Value" value={b => b.groupValue.Other} sub={b => `${pct(b.groupValue.Other, b.lostValue)} of value lost`} indent />
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
        {!detailLoading && detailCount > filteredDetail.length && (
          <div className="mb-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
            Showing {filteredDetail.length.toLocaleString('en-IN')} of {detailCount.toLocaleString('en-IN')} — download the CSV for the full list.
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
                  const days = daysBetween(r.createdAt, r.closureDate);
                  const cats = (r.cartItems || '').split(',').map(s => s.trim()).filter(Boolean);
                  return (
                    <tr key={r.id || i} className="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                      <td className="px-3 py-2.5 text-gray-400 font-mono">{i + 1}</td>
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
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDetailDate(r.closureDate)}</td>
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
      </section>
    </div>
  );
}

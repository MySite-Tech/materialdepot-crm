'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchFootfallDashboard,
  fetchFootfallNonConverted,
  fetchFootfallNoCart,
  FootfallDashboardData,
  FootfallFilters,
  FootfallBMRow,
  FootfallBranchRow,
  FootfallNonConvertedPage,
  FootfallNoCartPage,
} from '../lib/mockApi';

interface Props {
  branches: string[];
  allowedBranches: string[];
}

// ── Shared filter chip components ────────────────────────────────────────────

interface FilterChipProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  color?: { active: string };
  searchable?: boolean;
}

function FilterChip({ label, options, selected, onChange, color, searchable }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const active = selected.length > 0;
  const c = color || { active: '#3B82F6' };
  const visible = searchable && search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `${label}: ${selected.join(', ')}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[190px] flex flex-col" style={{ maxHeight: 260 }}>
            {searchable && (
              <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none bg-white"
                  style={{ accentColor: c.active }}
                />
              </div>
            )}
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-gray-400">{search.trim() ? `No match for "${search}"` : 'No options'}</div>
              )}
              {visible.map(opt => (
                <label key={opt} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: c.active }} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface DateRange { from: string; to: string }

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

interface DateChipProps {
  label: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
  color?: { active: string };
}

function DateChip({ label, value, onChange, color }: DateChipProps) {
  const active = value.from || value.to;
  const display = active
    ? `${value.from ? fmtDate(value.from) : '…'} – ${value.to ? fmtDate(value.to) : '…'}`
    : label;
  const [open, setOpen] = useState(false);
  const c = color || { active: '#22C55E' };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">{label}</div>
            <div className="flex items-center gap-2">
              <input
                type="date" value={value.from}
                onChange={e => onChange({ ...value, from: e.target.value })}
                className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date" value={value.to}
                onChange={e => onChange({ ...value, to: e.target.value })}
                className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none"
              />
            </div>
            {(value.from || value.to) && (
              <button
                onClick={() => { onChange({ from: '', to: '' }); setOpen(false); }}
                className="text-[11px] text-red-500 hover:text-red-600 cursor-pointer bg-transparent border-none p-0"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function PctBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / (max || 100)) * 100, 100);
  const color = value >= 50 ? '#22C55E' : value >= 25 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="font-semibold" style={{ color, minWidth: 42, textAlign: 'right' }}>{fmtPct(value)}</span>
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const FUNNEL_COLS = [
  { key: 'footfall_users', label: 'Footfall', color: 'text-gray-800' },
  { key: 'cart_users',     label: 'Cart',     color: 'text-blue-600' },
  { key: 'address_users',  label: 'PI',       color: 'text-purple-600' },
  { key: 'order_users',    label: 'Order',    color: 'text-green-600' },
] as const;

const PCT_COLS = [
  { key: 'cart_pct',    label: 'Cart Conv%' },
  { key: 'address_pct', label: 'PI Conv%' },
  { key: 'order_pct',   label: 'Order Conv%' },
] as const;

export default function FootfallDashboard({ branches, allowedBranches }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');

  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [dateRange, setDateRange] = useState<DateRange>({ from: monthStart, to: monthEnd });
  const [bmPage, setBmPage] = useState(0);
  const [bmSearch, setBmSearch] = useState('');
  const BM_PAGE_SIZE = 10;

  const [data, setData] = useState<FootfallDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ncData, setNcData] = useState<FootfallNonConvertedPage | null>(null);
  const [ncLoading, setNcLoading] = useState(false);
  const [ncPage, setNcPage] = useState(1);
  const [ncSearch, setNcSearch] = useState('');
  const ncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const NC_PAGE_SIZE = 10;

  const [ncData2, setNcData2] = useState<FootfallNoCartPage | null>(null);
  const [ncLoading2, setNcLoading2] = useState(false);
  const [ncPage2, setNcPage2] = useState(1);
  const [ncSearch2, setNcSearch2] = useState('');
  const ncDebounceRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFilters = branchFilter.length > 0 || bmFilter.length > 0 || dateRange.from || dateRange.to;

  const load = useCallback((filters: FootfallFilters) => {
    setLoading(true);
    fetchFootfallDashboard(filters)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const loadNonConverted = useCallback((filters: FootfallFilters, page: number, q: string) => {
    setNcLoading(true);
    fetchFootfallNonConverted({ ...filters, page, pageSize: NC_PAGE_SIZE, q: q || undefined })
      .then(setNcData)
      .catch(() => setNcData(null))
      .finally(() => setNcLoading(false));
  }, []);

  const loadNoCart = useCallback((filters: FootfallFilters, page: number, q: string) => {
    setNcLoading2(true);
    fetchFootfallNoCart({ ...filters, page, pageSize: NC_PAGE_SIZE, q: q || undefined })
      .then(setNcData2)
      .catch(() => setNcData2(null))
      .finally(() => setNcLoading2(false));
  }, []);

  // Compute effective branches once so both loaders share the same value
  const getEffectiveBranches = useCallback(() =>
    isRestricted
      ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
      : (branchFilter.length > 0 ? branchFilter : undefined),
  [isRestricted, branchFilter, allowedBranches]);

  useEffect(() => {
    setLoading(true);
    setNcLoading(true);
    setNcLoading2(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const filters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
      };
      setBmPage(0);
      setNcPage(1);
      setNcSearch('');
      setNcPage2(1);
      setNcSearch2('');
      load(filters);
      loadNonConverted(filters, 1, '');
      loadNoCart(filters, 1, '');
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmFilter, dateRange, load, loadNonConverted, loadNoCart, getEffectiveBranches]);

  // Re-fetch non-converted when page changes
  useEffect(() => {
    const filters: FootfallFilters = {
      branch: getEffectiveBranches(),
      bm: bmFilter.length > 0 ? bmFilter : undefined,
      dateFrom: dateRange.from || undefined,
      dateTo: dateRange.to || undefined,
    };
    loadNonConverted(filters, ncPage, ncSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncPage]);

  // Re-fetch no-cart when page changes
  useEffect(() => {
    const filters: FootfallFilters = {
      branch: getEffectiveBranches(),
      bm: bmFilter.length > 0 ? bmFilter : undefined,
      dateFrom: dateRange.from || undefined,
      dateTo: dateRange.to || undefined,
    };
    loadNoCart(filters, ncPage2, ncSearch2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncPage2]);

  // Debounced re-fetch when search term changes (resets to page 1)
  useEffect(() => {
    if (ncDebounceRef.current) clearTimeout(ncDebounceRef.current);
    ncDebounceRef.current = setTimeout(() => {
      const filters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
      };
      setNcPage(1);
      loadNonConverted(filters, 1, ncSearch);
    }, 350);
    return () => { if (ncDebounceRef.current) clearTimeout(ncDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncSearch]);

  // Debounced re-fetch for no-cart search
  useEffect(() => {
    if (ncDebounceRef2.current) clearTimeout(ncDebounceRef2.current);
    ncDebounceRef2.current = setTimeout(() => {
      const filters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
      };
      setNcPage2(1);
      loadNoCart(filters, 1, ncSearch2);
    }, 350);
    return () => { if (ncDebounceRef2.current) clearTimeout(ncDebounceRef2.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncSearch2]);

  const availableBMs = data?.available_bms ?? [];

  type SummaryCardKey = 'footfall_users' | 'cart_users' | 'address_users' | 'order_users';
  type SummaryPctKey = 'cart_pct' | 'address_pct' | 'order_pct';
  const SUMMARY_CARDS: Array<{ key: SummaryCardKey; label: string; color: string; pctKey?: SummaryPctKey }> = [
    { key: 'footfall_users', label: 'Footfall Clients',  color: 'text-gray-900' },
    { key: 'cart_users',     label: 'Cart Clients',      color: 'text-blue-600',   pctKey: 'cart_pct' },
    { key: 'address_users',  label: 'PI Clients',        color: 'text-purple-600', pctKey: 'address_pct' },
    { key: 'order_users',    label: 'Order Clients',     color: 'text-green-600',  pctKey: 'order_pct' },
  ];

  function FunnelTable<T extends FootfallBMRow | FootfallBranchRow>({
    title,
    rows,
    nameKey,
    searchState,
  }: {
    title: string;
    rows: T[];
    nameKey: keyof T;
    searchState?: [string, (v: string) => void];
  }) {
    const [search, setSearch] = searchState ?? ['', () => {}];
    const filtered = search.trim()
      ? rows.filter(r => String(r[nameKey]).toLowerCase().includes(search.trim().toLowerCase()))
      : rows;
    const totalPages = Math.ceil(filtered.length / BM_PAGE_SIZE) || 1;
    const page = Math.min(bmPage, totalPages - 1);
    const pageRows = filtered.slice(page * BM_PAGE_SIZE, (page + 1) * BM_PAGE_SIZE);

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <span className="text-[13px] font-bold text-gray-800 shrink-0">{title}</span>
          {searchState && (
            <input
              type="text" placeholder={`Search ${title}…`} value={search}
              onChange={e => { setSearch(e.target.value); setBmPage(0); }}
              className="flex-1 max-w-[220px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none focus:border-yellow-400 bg-white"
            />
          )}
          <span className="text-[11px] text-gray-400 ml-auto shrink-0">
            {search.trim() ? `${filtered.length} of ${rows.length}` : rows.length} rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">{title}</th>
                {FUNNEL_COLS.map(c => (
                  <th key={c.key} className="text-right px-3 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">{c.label}</th>
                ))}
                {PCT_COLS.map(c => (
                  <th key={c.key} className="text-right px-3 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-[12px] text-gray-400">No results{search.trim() ? ` for "${search}"` : ''}</td></tr>
              )}
              {pageRows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{String(row[nameKey])}</td>
                  {FUNNEL_COLS.map(c => (
                    <td key={c.key} className={`px-3 py-2.5 text-right font-medium ${c.color}`}>
                      {((row[c.key] as number) ?? 0).toLocaleString()}
                    </td>
                  ))}
                  {PCT_COLS.map(c => (
                    <td key={c.key} className="px-3 py-2.5 text-right">
                      <PctBar value={(row[c.key] as number) ?? 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-400">
              Showing {page * BM_PAGE_SIZE + 1}–{Math.min((page + 1) * BM_PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setBmPage(0)} disabled={page === 0} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">First</button>
              <button onClick={() => setBmPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <span className="text-[11px] text-gray-500 px-2">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setBmPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Next</button>
              <button onClick={() => setBmPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Last</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip label="Branch" options={branchOptions} selected={branchFilter}
          onChange={v => { setBranchFilter(v); setBmFilter([]); }} color={{ active: '#3B82F6' }} />
        <FilterChip label="BM" options={availableBMs} selected={bmFilter}
          onChange={setBmFilter} color={{ active: '#8B5CF6' }} searchable />
        <DateChip label="Date Range" value={dateRange} onChange={setDateRange} color={{ active: '#F59E0B' }} />
        {hasFilters && (
          <button
            onClick={() => {
              setBranchFilter([]);
              setBmFilter([]);
              setDateRange({ from: monthStart, to: monthEnd });
            }}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all"
          >
            ✕ Clear
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 font-mono">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          {data ? `${data.footfall_users?.toLocaleString()} clients` : '—'}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SUMMARY_CARDS.map(({ key, label, color, pctKey }) => {
          const val = data?.[key] ?? null;
          const pct = pctKey && data ? data[pctKey] : null;
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
              {loading && !data
                ? <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                : <div className={`text-[26px] font-bold leading-tight ${color}`}>
                    {val === null ? '—' : (val as number).toLocaleString()}
                  </div>
              }
              {pct !== null && (
                <div className="text-[11px] text-gray-400 mt-0.5">{fmtPct(pct)} of footfall</div>
              )}
            </div>
          );
        })}
      </div>

      {(data?.by_branch?.length ?? 0) > 0 && (
        <FunnelTable title="By Branch" rows={data!.by_branch} nameKey="branch" />
      )}

      {(data?.by_bm?.length ?? 0) > 0 && (
        <FunnelTable
          title="By BM"
          rows={data!.by_bm}
          nameKey="bm_name"
          searchState={[bmSearch, (v) => { setBmSearch(v); setBmPage(0); }]}
        />
      )}

      {!loading && data && data.by_bm.length === 0 && data.by_branch.length === 0 && (
        <div className="text-center text-gray-400 text-[13px] py-10">No footfall records found for the selected filters.</div>
      )}

      {/* Cart Not Converted panel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-bold text-gray-800 shrink-0">Cart Not Converted</span>
          <input
            type="text"
            placeholder="Search name, contact or BM…"
            value={ncSearch}
            onChange={e => setNcSearch(e.target.value)}
            className="flex-1 max-w-[260px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none focus:border-orange-400 bg-white"
          />
          {ncData && (
            <span className="text-[11px] text-gray-400 ml-auto shrink-0">{ncData.count.toLocaleString()} clients</span>
          )}
          {ncLoading && (
            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin shrink-0" />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">#</th>
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">BM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!ncLoading && (!ncData || ncData.results.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-gray-400">
                    No unconverted cart clients found.
                  </td>
                </tr>
              )}
              {ncLoading && !ncData && Array.from({ length: NC_PAGE_SIZE }).map((_, i) => (
                <tr key={i}>
                  {[1,2,3,4].map(c => (
                    <td key={c} className="px-4 sm:px-5 py-2.5">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: c === 1 ? 24 : c === 3 ? 80 : '70%' }} />
                    </td>
                  ))}
                </tr>
              ))}
              {ncData?.results.map((row, i) => {
                const globalIdx = ((ncData.page - 1) * NC_PAGE_SIZE) + i + 1;
                return (
                  <tr key={row.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 sm:px-5 py-2.5 text-gray-400 tabular-nums">{globalIdx}</td>
                    <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{row.name || '—'}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-gray-500 font-mono">{row.contact || '—'}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-gray-600">{row.bm}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ncData && ncData.total_pages > 1 && (
          <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-400">
              Showing {((ncData.page - 1) * NC_PAGE_SIZE) + 1}–{Math.min(ncData.page * NC_PAGE_SIZE, ncData.count)} of {ncData.count}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setNcPage(1)} disabled={ncData.page <= 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">First</button>
              <button onClick={() => setNcPage(p => Math.max(1, p - 1))} disabled={ncData.page <= 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <span className="text-[11px] text-gray-500 px-2">Page {ncData.page} of {ncData.total_pages}</span>
              <button onClick={() => setNcPage(p => Math.min(ncData.total_pages, p + 1))} disabled={ncData.page >= ncData.total_pages} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Next</button>
              <button onClick={() => setNcPage(ncData.total_pages)} disabled={ncData.page >= ncData.total_pages} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Last</button>
            </div>
          </div>
        )}
      </div>

      {/* No Cart Created panel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-bold text-gray-800 shrink-0">No Cart Created</span>
          <input
            type="text"
            placeholder="Search name, contact or BM…"
            value={ncSearch2}
            onChange={e => setNcSearch2(e.target.value)}
            className="flex-1 max-w-[260px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none focus:border-red-400 bg-white"
          />
          {ncData2 && (
            <span className="text-[11px] text-gray-400 ml-auto shrink-0">{ncData2.count.toLocaleString()} clients</span>
          )}
          {ncLoading2 && (
            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin shrink-0" />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">#</th>
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">BM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!ncLoading2 && (!ncData2 || ncData2.results.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-gray-400">
                    No clients without a cart found.
                  </td>
                </tr>
              )}
              {ncLoading2 && !ncData2 && Array.from({ length: NC_PAGE_SIZE }).map((_, i) => (
                <tr key={i}>
                  {[1,2,3,4].map(c => (
                    <td key={c} className="px-4 sm:px-5 py-2.5">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: c === 1 ? 24 : c === 3 ? 80 : '70%' }} />
                    </td>
                  ))}
                </tr>
              ))}
              {ncData2?.results.map((row, i) => {
                const globalIdx = ((ncData2.page - 1) * NC_PAGE_SIZE) + i + 1;
                return (
                  <tr key={row.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 sm:px-5 py-2.5 text-gray-400 tabular-nums">{globalIdx}</td>
                    <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{row.name || '—'}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-gray-500 font-mono">{row.contact || '—'}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-gray-600">{row.bm}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ncData2 && ncData2.total_pages > 1 && (
          <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-400">
              Showing {((ncData2.page - 1) * NC_PAGE_SIZE) + 1}–{Math.min(ncData2.page * NC_PAGE_SIZE, ncData2.count)} of {ncData2.count}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setNcPage2(1)} disabled={ncData2.page <= 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">First</button>
              <button onClick={() => setNcPage2(p => Math.max(1, p - 1))} disabled={ncData2.page <= 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <span className="text-[11px] text-gray-500 px-2">Page {ncData2.page} of {ncData2.total_pages}</span>
              <button onClick={() => setNcPage2(p => Math.min(ncData2.total_pages, p + 1))} disabled={ncData2.page >= ncData2.total_pages} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Next</button>
              <button onClick={() => setNcPage2(ncData2.total_pages)} disabled={ncData2.page >= ncData2.total_pages} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

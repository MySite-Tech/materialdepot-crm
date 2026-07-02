'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchFootfallBreakdown, FootfallBreakdownData, FootfallBreakdownRow,
  fetchAvailableBMs, fetchCategoryOptions, CategoryOption,
} from '../lib/mockApi';

interface Props {
  branches: string[];
  allowedBranches: string[];
}

interface DateRange { from: string; to: string }

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

function fmtValue(v: number, kind: FootfallBreakdownRow['kind']) {
  if (kind === 'money') return `₹${Math.round(v ?? 0).toLocaleString('en-IN')}`;
  if (kind === 'pct') return `${(v ?? 0).toFixed(1)}%`;
  return (v ?? 0).toLocaleString('en-IN');
}

// ── Filter chips ───────────────────────────────────────────────────────────

function MultiChip({
  label, options, selected, onChange, color, searchable,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; color: string; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const active = selected.length > 0;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const visible = searchable && search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `${label}: ${selected.join(', ')}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[190px] flex flex-col" style={{ maxHeight: 260 }}>
            {searchable && (
              <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
                <input autoFocus type="text" placeholder="Search…" value={search}
                  onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 outline-none bg-white" />
              </div>
            )}
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No options</div>}
              {visible.map((opt, i) => (
                <label key={i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: color }} />
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

function BMChip({
  selected, onChange, options,
}: { selected: string[]; onChange: (v: string[]) => void; options: { name: string; contact: string }[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const color = '#8B5CF6';
  const active = selected.length > 0;
  const toggle = (contact: string) => onChange(selected.includes(contact) ? selected.filter(x => x !== contact) : [...selected, contact]);
  const visible = search.trim()
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.contact.includes(search))
    : options;
  const labels = selected.map(c => options.find(o => o.contact === c)?.name || c).join(', ');
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `BM: ${labels}` : 'BM'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[260px] flex flex-col" style={{ maxHeight: 280 }}>
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
              <input autoFocus type="text" placeholder="Search BM…" value={search}
                onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 outline-none bg-white" />
            </div>
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No options</div>}
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

function DateChip({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const active = value.from || value.to;
  const display = active ? `${value.from ? fmtDate(value.from) : '…'} – ${value.to ? fmtDate(value.to) : '…'}` : 'Date Range';
  const [open, setOpen] = useState(false);
  const color = '#F59E0B';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Date Range</div>
            <div className="flex items-center gap-2">
              <input type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })}
                className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none" />
              <span className="text-gray-400">–</span>
              <input type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })}
                className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Visual group breaks (a divider is drawn before each of these row keys)
const GROUP_STARTS = new Set(['total_carts', 'total_orders', 'new_conversion', 'total_sales', 'new_order_aov', 'overall_client_aov']);

export default function FootfallBreakdownDashboard({ branches, allowedBranches }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const storeOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');

  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [dateRange, setDateRange] = useState<DateRange>({ from: monthStart, to: monthEnd });

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [bmRows, setBmRows] = useState<{ name: string; contact: string }[]>([]);
  const [data, setData] = useState<FootfallBreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([])); }, []);

  const getEffectiveStores = useCallback(() =>
    isRestricted
      ? (storeFilter.length > 0 ? storeFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
      : (storeFilter.length > 0 ? storeFilter : undefined),
  [isRestricted, storeFilter, allowedBranches]);

  const storeKey = (getEffectiveStores() ?? []).join(',');
  useEffect(() => {
    fetchAvailableBMs(storeKey ? storeKey.split(',') : undefined).then(setBmRows).catch(() => setBmRows([]));
  }, [storeKey]);

  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchFootfallBreakdown({
        branch: getEffectiveStores(),
        bm: bmFilter.length ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
        category: categoryFilter.length ? categoryFilter : undefined,
      })
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [storeFilter, bmFilter, categoryFilter, dateRange, getEffectiveStores]);

  const hasFilters = storeFilter.length > 0 || bmFilter.length > 0 || categoryFilter.length > 0
    || dateRange.from !== monthStart || dateRange.to !== monthEnd;

  const stores = data?.stores ?? [];
  const rows = data?.rows ?? [];

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <DateChip value={dateRange} onChange={setDateRange} />
        <MultiChip label="Store" options={storeOptions} selected={storeFilter}
          onChange={v => { setStoreFilter(v); setBmFilter([]); }} color="#3B82F6" />
        <MultiChip label="Category" options={categoryOptions.map(c => c.name)} selected={categoryFilter}
          onChange={setCategoryFilter} color="#10B981" searchable />
        <BMChip selected={bmFilter} onChange={setBmFilter} options={bmRows} />
        {hasFilters && (
          <button
            onClick={() => { setStoreFilter([]); setBmFilter([]); setCategoryFilter([]); setDateRange({ from: monthStart, to: monthEnd }); }}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all"
          >
            ✕ Clear
          </button>
        )}
        <span className="flex items-center gap-2 text-[11px] text-gray-400 font-mono shrink-0 ml-auto">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          {stores.length ? `${stores.length} store${stores.length > 1 ? 's' : ''}` : '—'}
        </span>
      </div>

      {/* Breakdown grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 sm:px-5 py-2.5 font-semibold text-gray-400 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[140px]">Store</th>
                {rows.map(m => (
                  <th key={m.key} title={m.comment}
                    className={`text-right px-3 py-2.5 font-semibold text-gray-400 text-[10px] uppercase tracking-wider align-bottom ${GROUP_STARTS.has(m.key) ? 'border-l-2 border-gray-200' : ''}`}>
                    <div className="whitespace-normal leading-tight max-w-[110px] ml-auto">{m.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && !data && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: (rows.length || 6) + 1 }).map((_, c) => (
                    <td key={c} className="px-4 sm:px-5 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: '70%' }} /></td>
                  ))}
                </tr>
              ))}
              {!loading && stores.map(st => (
                <tr key={st} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 sm:px-5 py-2 font-semibold text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">{st}</td>
                  {rows.map(m => (
                    <td key={m.key} className={`px-3 py-2 text-right font-medium text-gray-700 tabular-nums whitespace-nowrap ${GROUP_STARTS.has(m.key) ? 'border-l-2 border-gray-200' : ''}`}>
                      {fmtValue(m.values[st] ?? 0, m.kind)}
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && rows.length > 0 && (
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 sm:px-5 py-2 font-bold text-gray-800 sticky left-0 bg-gray-50 z-10 whitespace-nowrap">Total</td>
                  {rows.map(m => (
                    <td key={m.key} className={`px-3 py-2 text-right font-bold text-gray-800 tabular-nums whitespace-nowrap ${GROUP_STARTS.has(m.key) ? 'border-l-2 border-gray-200' : ''}`}>
                      {fmtValue(m.total, m.kind)}
                    </td>
                  ))}
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-10 text-center text-[13px] text-gray-400">No data for the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

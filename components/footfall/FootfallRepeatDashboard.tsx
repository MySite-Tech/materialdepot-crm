'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFootfallRepeat, FootfallRepeatData, FootfallRepeatRow } from '@/lib/mockApi';

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

const fmtInt = (v: number) => (v ?? 0).toLocaleString('en-IN');
const fmtMoney = (v: number) => `₹${Math.round(v ?? 0).toLocaleString('en-IN')}`;

// ── Store (branch) multi-select chip ─────────────────────────────────────────

function StoreChip({
  options, selected, onChange,
}: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const active = selected.length > 0;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const c = '#3B82F6';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: c, borderColor: c, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />}
        {active ? `Store: ${selected.join(', ')}` : 'Store'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[190px] flex flex-col" style={{ maxHeight: 260 }}>
            <div className="overflow-y-auto py-1 flex-1">
              {options.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No stores</div>}
              {options.map((opt, i) => (
                <label key={i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: c }} />
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

// ── Date range chip ──────────────────────────────────────────────────────────

function DateChip({
  label, value, onChange,
}: { label: string; value: DateRange; onChange: (v: DateRange) => void }) {
  const active = value.from || value.to;
  const display = active ? `${value.from ? fmtDate(value.from) : '…'} – ${value.to ? fmtDate(value.to) : '…'}` : label;
  const [open, setOpen] = useState(false);
  const c = '#F59E0B';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: c, borderColor: c, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">{label}</div>
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

// ── Table ─────────────────────────────────────────────────────────────────────

const COLS: Array<{ key: keyof FootfallRepeatRow; label: string; kind: 'int' | 'money' }> = [
  { key: 'unique_clients',   label: 'Total Unique Clients',   kind: 'int' },
  { key: 'orders_current',   label: 'Orders Current Month(s)', kind: 'int' },
  { key: 'orders_till_last', label: 'Orders Prev Month(s)',    kind: 'int' },
  { key: 'sales_current',    label: 'Sales Current Month(s)',  kind: 'money' },
  { key: 'sales_till_last',  label: 'Sales Prev Month(s)',     kind: 'money' },
  { key: 'aov_current',      label: 'AOV Current Month(s)',    kind: 'money' },
  { key: 'aov_till_last',    label: 'AOV Prev Month(s)',       kind: 'money' },
];

function cell(row: FootfallRepeatRow, col: (typeof COLS)[number]) {
  const v = row[col.key] as number;
  return col.kind === 'money' ? fmtMoney(v) : fmtInt(v);
}

export default function FootfallRepeatDashboard({ branches, allowedBranches }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const storeOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');

  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [dateRange, setDateRange] = useState<DateRange>({ from: monthStart, to: monthEnd });

  const [data, setData] = useState<FootfallRepeatData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getEffectiveStores = useCallback(() =>
    isRestricted
      ? (storeFilter.length > 0 ? storeFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
      : (storeFilter.length > 0 ? storeFilter : undefined),
  [isRestricted, storeFilter, allowedBranches]);

  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchFootfallRepeat({
        branch: getEffectiveStores(),
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
      })
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [storeFilter, dateRange, getEffectiveStores]);

  const hasFilters = storeFilter.length > 0 || dateRange.from !== monthStart || dateRange.to !== monthEnd;
  const rows = data?.rows ?? [];

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <DateChip label="Date Range" value={dateRange} onChange={setDateRange} />
        <StoreChip options={storeOptions} selected={storeFilter} onChange={setStoreFilter} />
        {hasFilters && (
          <button
            onClick={() => { setStoreFilter([]); setDateRange({ from: monthStart, to: monthEnd }); }}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all"
          >
            ✕ Clear
          </button>
        )}
        <span className="flex items-center gap-2 text-[11px] text-gray-400 font-mono shrink-0 ml-auto">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          {data ? `Months: ${data.current_month}` : '—'}
        </span>
      </div>

      {/* Repeat footfall table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <span className="text-[13px] font-bold text-gray-800">Repeat Footfall</span>
          <span className="text-[11px] text-gray-400">Clients bucketed by number of visits in range</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider whitespace-nowrap">Repeat Footfall</th>
                {COLS.map(c => (
                  <th key={c.key} className="text-right px-3 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && !data && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: COLS.length + 1 }).map((_, c) => (
                    <td key={c} className="px-4 sm:px-5 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: c === 0 ? 24 : '70%' }} /></td>
                  ))}
                </tr>
              ))}
              {!loading && rows.map(row => (
                <tr key={row.bucket} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 sm:px-5 py-2.5 font-semibold text-gray-700">{row.bucket}</td>
                  {COLS.map(c => (
                    <td key={c.key} className="px-3 py-2.5 text-right font-medium text-gray-700 tabular-nums whitespace-nowrap">{cell(row, c)}</td>
                  ))}
                </tr>
              ))}
              {!loading && data?.total && (
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td className="px-4 sm:px-5 py-2.5 text-gray-800">{data.total.bucket}</td>
                  {COLS.map(c => (
                    <td key={c.key} className="px-3 py-2.5 text-right text-gray-800 tabular-nums whitespace-nowrap">{cell(data.total, c)}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

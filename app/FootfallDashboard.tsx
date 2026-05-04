'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchFootfallDashboard,
  FootfallDashboardData,
  FootfallFilters,
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
}

function FilterChip({ label, options, selected, onChange, color }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const active = selected.length > 0;
  const c = color || { active: '#3B82F6' };
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
        {active ? `${label}: ${selected.join(', ')}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[170px] max-h-[200px] overflow-y-auto py-1">
            {options.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-gray-400">No options</div>
            )}
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: c.active }} />
                {opt}
              </label>
            ))}
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

  const hasFilters = branchFilter.length > 0 || bmFilter.length > 0 || dateRange.from || dateRange.to;

  const load = useCallback((filters: FootfallFilters) => {
    setLoading(true);
    fetchFootfallDashboard(filters)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const effectiveBranches = isRestricted
        ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
        : (branchFilter.length > 0 ? branchFilter : undefined);
      setBmPage(0);
      load({
        branch: effectiveBranches,
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
      });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmFilter, dateRange, load, isRestricted, allowedBranches]);

  const availableBMs = data?.available_bms ?? [];

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip
          label="Branch"
          options={branchOptions}
          selected={branchFilter}
          onChange={v => { setBranchFilter(v); setBmFilter([]); }}
          color={{ active: '#3B82F6' }}
        />
        <FilterChip
          label="BM"
          options={availableBMs}
          selected={bmFilter}
          onChange={setBmFilter}
          color={{ active: '#8B5CF6' }}
        />
        <DateChip
          label="Date Range"
          value={dateRange}
          onChange={setDateRange}
          color={{ active: '#F59E0B' }}
        />
        {hasFilters && (
          <button
            onClick={() => { setBranchFilter([]); setBmFilter([]); setDateRange({ from: '', to: '' }); }}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all"
          >
            ✕ Clear
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 font-mono">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          {data ? `${data.total.toLocaleString()} visits` : '—'}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['total', 'cart_created', 'no_cart', 'cart_pct'] as const).map((key) => {
          const labels: Record<string, string> = { total: 'Total Footfall', cart_created: 'Cart Created', no_cart: 'No Cart', cart_pct: 'Conversion Rate' };
          const colors: Record<string, string> = { total: 'text-black', cart_created: 'text-green-600', no_cart: 'text-gray-500', cart_pct: 'text-yellow-500' };
          const val = data?.[key] ?? null;
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{labels[key]}</div>
              {loading && !data
                ? <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                : <div className={`text-[26px] font-bold leading-tight ${colors[key]}`}>
                    {val === null ? '—' : key === 'cart_pct' ? fmtPct(val as number) : (val as number).toLocaleString()}
                  </div>
              }
              {key === 'cart_created' && data && (
                <div className="text-[11px] text-gray-400 mt-0.5">{fmtPct(data.cart_pct)} of footfall</div>
              )}
              {key === 'no_cart' && data && (
                <div className="text-[11px] text-gray-400 mt-0.5">{fmtPct(data.no_cart_pct)} of footfall</div>
              )}
            </div>
          );
        })}
      </div>

      {/* By Branch */}
      {(data?.by_branch?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
            <span className="text-[13px] font-bold text-gray-800">By Branch</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Branch</th>
                  <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Total</th>
                  <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cart Created</th>
                  <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">No Cart</th>
                  <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cart %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.by_branch.map(row => (
                  <tr key={row.branch} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{row.branch}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-right text-gray-700">{row.total.toLocaleString()}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-right text-green-600 font-medium">{row.cart_created.toLocaleString()}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-right text-gray-400">{row.no_cart.toLocaleString()}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-right">
                      <span className={`font-semibold ${row.cart_pct >= 50 ? 'text-green-600' : row.cart_pct >= 25 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {fmtPct(row.cart_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By BM */}
      {(data?.by_bm?.length ?? 0) > 0 && (() => {
        const filtered = bmSearch.trim()
          ? data!.by_bm.filter(r => r.bm_name.toLowerCase().includes(bmSearch.trim().toLowerCase()))
          : data!.by_bm;
        const totalPages = Math.ceil(filtered.length / BM_PAGE_SIZE) || 1;
        const page = Math.min(bmPage, totalPages - 1);
        const pageRows = filtered.slice(page * BM_PAGE_SIZE, (page + 1) * BM_PAGE_SIZE);
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <span className="text-[13px] font-bold text-gray-800 shrink-0">By BM</span>
              <input
                type="text"
                placeholder="Search BM…"
                value={bmSearch}
                onChange={e => { setBmSearch(e.target.value); setBmPage(0); }}
                className="flex-1 max-w-[220px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none focus:border-yellow-400 bg-white"
              />
              <span className="text-[11px] text-gray-400 ml-auto shrink-0">
                {bmSearch.trim() ? `${filtered.length} of ${data!.by_bm.length}` : `${data!.by_bm.length}`} BMs
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">BM Name</th>
                    <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cart Created</th>
                    <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">No Cart</th>
                    <th className="text-right px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cart %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-gray-400">No BMs match "{bmSearch}"</td></tr>
                  )}
                  {pageRows.map(row => (
                    <tr key={row.bm_name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{row.bm_name}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right text-gray-700">{row.total.toLocaleString()}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right text-green-600 font-medium">{row.cart_created.toLocaleString()}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right text-gray-400">{row.no_cart.toLocaleString()}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right">
                        <span className={`font-semibold ${row.cart_pct >= 50 ? 'text-green-600' : row.cart_pct >= 25 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {fmtPct(row.cart_pct)}
                        </span>
                      </td>
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
      })()}

      {!loading && data && data.by_bm.length === 0 && data.by_branch.length === 0 && (
        <div className="text-center text-gray-400 text-[13px] py-10">No footfall records found for the selected filters.</div>
      )}
    </div>
  );
}

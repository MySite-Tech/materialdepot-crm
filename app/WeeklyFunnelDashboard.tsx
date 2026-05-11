'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchWeeklyFunnel,
  WeeklyFunnelData,
  WeeklyFunnelRow,
  MonthSplitRow,
} from '../lib/mockApi';

interface Props {
  branches: string[];
  allowedBranches: string[];
}

// ── Filter chips ──────────────────────────────────────────────────────────────

function FilterChip({
  label, options, selected, onChange, color,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; color?: { active: string };
}) {
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
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `${label}: ${selected.join(', ')}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[170px] max-h-[220px] overflow-y-auto py-1">
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

function BMFilterChip({
  selected, onChange, options, color,
}: {
  selected: string[]; onChange: (v: string[]) => void;
  options: { name: string; contact: string }[]; color?: { active: string };
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const c = color || { active: '#8B5CF6' };
  const active = selected.length > 0;

  const visible = search.trim()
    ? options.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.contact.includes(search)
      )
    : options;

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter(x => x !== name) : [...selected, name]);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `BM: ${selected.join(', ')}` : 'BM'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[200px] flex flex-col" style={{ maxHeight: 260 }}>
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="Search BM…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none bg-white"
              />
            </div>
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>
              )}
              {visible.map(o => (
                <label key={o.contact || o.name} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.name)}
                    onChange={() => toggle(o.name)}
                    style={{ accentColor: c.active }}
                  />
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

const fmtDateChip = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

function DateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const active = !!value;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: '#F59E0B', borderColor: '#F59E0B', color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />}
        {active ? fmtDateChip(value) : 'Date'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Anchor date</div>
            <input
              autoFocus
              type="date"
              value={value}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => { onChange(e.target.value); if (e.target.value) setOpen(false); }}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none"
            />
            {active && (
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50"
              >
                Clear date
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtINR = (n: number) =>
  n >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : n >= 1000
    ? `₹${(n / 1000).toFixed(0)}k`
    : `₹${n}`;

const pctCell = (v: number) => (
  <span className={`font-mono text-[11px] ${v >= 50 ? 'text-green-600' : v >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
    {v}%
  </span>
);

const VALUE_BUCKETS = ['0-25k', '25-50k', '50-100k', '100k-250k', '250k-500k', '500k+'] as const;

// ── Main component ────────────────────────────────────────────────────────────

export default function WeeklyFunnelDashboard({ branches, allowedBranches }: Props) {
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [data, setData] = useState<WeeklyFunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRestricted = allowedBranches.length > 0;
  const branchOptions = isRestricted
    ? allowedBranches.filter(b => b !== 'HQ')
    : branches.filter(b => b !== 'HQ');

  const load = useCallback((filters: { branch?: string[]; bm?: string[] }) => {
    setLoading(true);
    fetchWeeklyFunnel(filters)
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
      load({ branch: effectiveBranches, bm: bmFilter.length ? bmFilter : undefined, date: dateFilter || undefined });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmFilter, dateFilter, load, isRestricted, allowedBranches]);

  const weeklyRows: WeeklyFunnelRow[] = data?.weekly_rows ?? [];
  const cartSplit: MonthSplitRow[] = data?.cart_split_by_month ?? [];
  const orderSplit: MonthSplitRow[] = data?.order_split_by_month ?? [];
  const topCats: string[] = data?.category_split_by_month?.top_categories ?? [];
  const catRows = data?.category_split_by_month?.rows ?? [];

  return (
    <div className="px-3 sm:px-6 py-4 space-y-5">

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip
          label="Branch" options={branchOptions} selected={branchFilter}
          onChange={v => { setBranchFilter(v); setBmFilter([]); }}
          color={{ active: '#3B82F6' }}
        />
        <BMFilterChip
          selected={bmFilter} onChange={setBmFilter}
          options={data?.available_bms ?? []}
          color={{ active: '#8B5CF6' }}
        />
        <DateChip value={dateFilter} onChange={setDateFilter} />
        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 font-mono">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          Weekly Funnel
        </span>
      </div>

      {/* ── Section 1: Weekly funnel rows ─────────────────────────────────── */}
      <section>
        <h2 className="text-[14px] font-bold text-gray-900 mb-2">Footfall → Cart → PI → Order by Visit Week</h2>
        <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {loading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-xl">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Week', 'Type', 'Footfall', 'Cart', 'Cart%', 'PI', 'PI%', 'Order', 'Order%', 'Order Value', 'Avg Order Value', 'Avg Category'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && weeklyRows.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-[12px] text-gray-400">Loading…</td></tr>
                )}
                {!loading && weeklyRows.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-[12px] text-gray-400">No data</td></tr>
                )}
                {weeklyRows.map((row, i) => {
                  const isTotal = row.week === 'Total';
                  const isNew = row.customer_type === 'New';
                  return (
                    <tr
                      key={row.week}
                      className={`border-b border-gray-50 ${isTotal ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.week}</td>
                      <td className="px-3 py-2">
                        {!isTotal && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isNew ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                            {row.customer_type}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.footfall.toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono">{row.cart.toLocaleString()}</td>
                      <td className="px-3 py-2">{pctCell(row.cart_pct)}</td>
                      <td className="px-3 py-2 font-mono">{row.pi.toLocaleString()}</td>
                      <td className="px-3 py-2">{pctCell(row.pi_pct)}</td>
                      <td className="px-3 py-2 font-mono">{row.order.toLocaleString()}</td>
                      <td className="px-3 py-2">{pctCell(row.order_pct)}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-[#EAB308]">{fmtINR(row.order_value)}</td>
                      <td className="px-3 py-2 font-mono">{row.avg_order_value > 0 ? fmtINR(row.avg_order_value) : '—'}</td>
                      <td className="px-3 py-2 font-mono">{row.avg_category > 0 ? row.avg_category : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Section 2: Cart & Order splits by month ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[
          { label: 'Cart Split by Month', rows: cartSplit },
          { label: 'Order Split by Month', rows: orderSplit },
        ].map(({ label, rows }) => (
          <section key={label}>
            <h2 className="text-[14px] font-bold text-gray-900 mb-2">{label}</h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Month</th>
                      {VALUE_BUCKETS.map(b => (
                        <th key={b} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{b}</th>
                      ))}
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && rows.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
                    )}
                    {rows.map(row => (
                      <tr key={row.month} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.month}</td>
                        {VALUE_BUCKETS.map(b => (
                          <td key={b} className="px-3 py-2 text-right font-mono">{(row[b] ?? 0).toLocaleString()}</td>
                        ))}
                        <td className="px-3 py-2 text-right font-mono font-semibold">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* ── Section 3: Category split by month ───────────────────────────── */}
      <section>
        <h2 className="text-[14px] font-bold text-gray-900 mb-2">Category Split by Month (Top 5)</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Month</th>
                  {topCats.map(c => (
                    <th key={c} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && catRows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
                )}
                {!loading && topCats.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No category data</td></tr>
                )}
                {catRows.map(row => (
                  <tr key={row.month as string} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.month as string}</td>
                    {topCats.map(c => (
                      <td key={c} className="px-3 py-2 text-right font-mono">{((row[c] as number) ?? 0).toLocaleString()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}

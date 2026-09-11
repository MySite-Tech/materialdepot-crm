'use client';

import CategoryRevenueDashboard from '@/components/dashboard/category-revenue';
import OrderLostDashboard from '@/components/dashboard/order-lost/index';

import { BMFilterChip, DateChip, FilterChip } from '../ui/chips';
import { DEFAULT_STATUS_COLOR, LOST_COLORS, STATUS_COLORS } from './constants';
import { SectionHeader } from './ui/layout';
import { BranchPieTooltip, LostPieTooltip } from './ui/tooltips';
import { DashboardProps, DashboardView, WeekDay } from './types';
import { DateRange } from '../types';
import { fmtINR } from './utils';
import { fmtDate } from '../utils';
import { CategoryOption, DashboardBranchStatus, DashboardClosureLead, DashboardData, DashboardLostReason, fetchAvailableBMs, fetchCategoryOptions, fetchDashboardData } from '@/lib/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function Dashboard({ branches, allowedBranches = [], orderLostOnly = false, canEditTargets = false }: DashboardProps) {
  const [view, setView] = useState<DashboardView>(orderLostOnly ? 'orderLost' : 'overview');
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const [closureDate, setClosureDate] = useState<DateRange>({ from: '', to: '' });
  const [createdDate, setCreatedDate] = useState<DateRange>({ from: '', to: '' });
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const hasFilters = branchFilter.length > 0 || bmFilter.length > 0 || closureDate.from || closureDate.to || createdDate.from || createdDate.to || categoryFilter.length > 0;

  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRestricted = allowedBranches.length > 0;
  const branchOptions = useMemo(() => {
    const base = isRestricted ? allowedBranches : branches;
    return base.filter(b => b !== 'HQ');
  }, [branches, allowedBranches, isRestricted]);

  const load = useCallback((filters: Parameters<typeof fetchDashboardData>[0]) => {
    setLoading(true);
    fetchDashboardData(filters)
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
      load({
        branch: effectiveBranches,
        bm: bmFilter.length ? bmFilter : undefined,
        closureFrom: closureDate.from || undefined,
        closureTo: closureDate.to || undefined,
        createdFrom: createdDate.from || undefined,
        createdTo: createdDate.to || undefined,
        category: categoryFilter.length ? categoryFilter : undefined,
      });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmFilter, closureDate, createdDate, categoryFilter, load, isRestricted, allowedBranches]);

  const [bmRows, setBmRows] = useState<{ name: string; contact: string }[]>([]);
  const branchKey = (isRestricted
    ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
    : branchFilter
  ).join(',');
  useEffect(() => {
    const effective = branchKey ? branchKey.split(',') : undefined;
    fetchAvailableBMs(effective).then(setBmRows).catch(() => setBmRows([]));
  }, [branchKey]);
  const summary = data?.summary;
  const branchStatusData: DashboardBranchStatus[] = data?.branchStatus ?? [];
  const lostData: DashboardLostReason[] = data?.lostReasons ?? [];
  const closureLeads: DashboardClosureLead[] = data?.closurePipeline ?? [];

  const today = summary?.today ?? new Date().toISOString().slice(0, 10);
  const weekFrom = summary?.weekFrom ?? '';
  const weekTo = summary?.weekTo ?? '';

  const weekDays = useMemo((): WeekDay[] => {
    if (!weekFrom) return [];
    const days: WeekDay[] = [];
    const d = new Date(weekFrom);
    for (let i = 0; i < 7; i++) {
      const dateStr = d.toISOString().slice(0, 10);
      const dl = closureLeads.filter(l => l.closureDate === dateStr);
      days.push({ day: d.toLocaleDateString('en-IN', { weekday: 'short' }), amount: dl.reduce((s, l) => s + (l.cartValue || 0), 0), count: dl.length });
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [closureLeads, weekFrom]);

  const [closurePage, setClosurePage] = useState(0);
  const CLOSURE_PAGE_SIZE = 10;
  const closureTotalPages = Math.ceil(closureLeads.length / CLOSURE_PAGE_SIZE) || 1;
  const closurePage$ = Math.min(closurePage, closureTotalPages - 1);
  const closurePagedRows = closureLeads.slice(closurePage$ * CLOSURE_PAGE_SIZE, (closurePage$ + 1) * CLOSURE_PAGE_SIZE);
  const closureTotalAmount = closureLeads.reduce((s, l) => s + (l.cartValue || 0), 0);

  const todayPipelineValue = summary?.todayClosureValue ?? 0;
  const todayPipelineCount = summary?.todayClosureCount ?? 0;
  const weekPipelineValue = summary?.weekClosureValue ?? 0;
  const weekPipelineCount = summary?.weekClosureCount ?? 0;

  const lostLeadsCount = lostData.reduce((s, d) => s + d.count, 0);
  const lostLeadsValue = lostData.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <div className="px-3 sm:px-6 pt-4 flex items-center gap-1.5">
        {(orderLostOnly
          ? ([{ key: 'orderLost', label: 'Order Lost' }] as const)
          : ([
              { key: 'overview', label: 'Overview' },
              { key: 'orderLost', label: 'Order Lost' },
              { key: 'categoryRevenue', label: 'Category Revenue' },
            ] as const)
        ).map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${view === t.key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'categoryRevenue' ? (
        <CategoryRevenueDashboard branches={branches} allowedBranches={allowedBranches} canEditTargets={canEditTargets} />
      ) : view === 'orderLost' ? (
        <OrderLostDashboard branches={branches} allowedBranches={allowedBranches} />
      ) : (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip label="Branch" options={branchOptions} selected={branchFilter} onChange={v => { setBranchFilter(v); setBmFilter([]); }} color={{ active: '#3B82F6' }} />
        <BMFilterChip selected={bmFilter} onChange={setBmFilter} options={bmRows} color={{ active: '#8B5CF6' }} />
        <DateChip label="Closure Date" value={closureDate} onChange={setClosureDate} color={{ active: '#F59E0B' }} />
        <DateChip label="Created Date" value={createdDate} onChange={setCreatedDate} color={{ active: '#22C55E' }} />
        <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={categoryFilter} onChange={setCategoryFilter} color={{ active: '#10B981' }} />
        {hasFilters && (
          <button onClick={() => { setBranchFilter([]); setBmFilter([]); setClosureDate({ from:'', to:'' }); setCreatedDate({ from:'', to:'' }); setCategoryFilter([]); }}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all">
            ✕ Clear
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 font-mono">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          {summary ? `${summary.total.toLocaleString()} leads` : '—'}
        </span>
      </div>

      <section>
        <SectionHeader title="Branch Performance" sub={`${branchStatusData.length} branches · lead status breakdown`} />
        {loading && branchStatusData.length === 0
          ? <div className="bg-white border border-gray-200 rounded-lg px-5 py-8 text-center text-[12px] text-gray-400">Loading…</div>
          : branchStatusData.length === 0
            ? <div className="bg-white border border-gray-200 rounded-lg px-5 py-8 text-center text-[12px] text-gray-400">No branch data</div>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {branchStatusData.map(b => (
                  <div key={b.branch} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <div className="font-bold text-[13px] text-gray-900">{b.branch}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{fmtINR(b.totalValue)}</div>
                    </div>
                    <div className="text-[10px] text-gray-400 mb-2">{b.total} leads</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={b.statuses} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                          {b.statuses.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.status] || DEFAULT_STATUS_COLOR} />)}
                        </Pie>
                        <Tooltip content={<BranchPieTooltip total={b.total} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-1">
                      {b.statuses.map(d => (
                        <div key={d.status} className="flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[d.status] || DEFAULT_STATUS_COLOR }} />
                            <span className="text-gray-500 truncate">{d.status}</span>
                          </span>
                          <span className="font-semibold text-gray-700 ml-2 shrink-0">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
      </section>

      <section>
        <SectionHeader title="Lost Reasons" sub={`${lostLeadsCount} orders lost · ${fmtINR(lostLeadsValue)} pipeline lost`} />
        {loading && lostData.length === 0
          ? <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-[12px] text-gray-400">Loading…</div>
          : lostData.length === 0
            ? <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-[12px] text-gray-400">No lost orders match current filters</div>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="font-semibold text-[12px] text-gray-700 mb-1">By Lead Count</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={lostData} dataKey="count" nameKey="reason" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {lostData.map((_, i) => <Cell key={i} fill={LOST_COLORS[i % LOST_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<LostPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="font-semibold text-[12px] text-gray-700 mb-3">Reason Breakdown</div>
                  <div className="space-y-2">
                    {lostData.map((d, i) => (
                      <div key={d.reason}>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LOST_COLORS[i % LOST_COLORS.length] }} />
                            <span className="text-gray-700 font-medium">{d.reason}</span>
                          </span>
                          <span className="text-gray-500 font-semibold">{d.count} · {d.pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: LOST_COLORS[i % LOST_COLORS.length] }} />
                        </div>
                        <div className="text-[10px] text-gray-400 text-right mt-0.5">{fmtINR(d.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
      </section>

      <section className="pb-6">
        <SectionHeader title="Closure Pipeline" sub="Unconverted leads with closure date up to today" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Today&apos;s Expected Closures</div>
            <div className="font-mono text-[20px] font-bold text-black">{fmtINR(todayPipelineValue)}</div>
            <div className="text-[11px] text-gray-400">{todayPipelineCount} lead{todayPipelineCount !== 1 ? 's' : ''} · {fmtDate(today)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">This Week&apos;s Expected Closures</div>
            <div className="font-mono text-[20px] font-bold text-[#EAB308]">{fmtINR(weekPipelineValue)}</div>
            <div className="text-[11px] text-gray-400">{weekPipelineCount} leads · {fmtDate(weekFrom)} – {fmtDate(weekTo)}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
          <div className="font-semibold text-[12px] text-gray-700 mb-1">Expected Closures by Day — This Week</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weekDays} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v: number) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${(v/1000).toFixed(0)}K`} tick={{ fontSize: 9 }} width={48} />
              <Tooltip formatter={(v: any) => fmtINR(Number(v))} labelFormatter={(l: any, p: any) => p && p[0] ? `${l} (${p[0].payload?.count} leads)` : String(l)} />
              <Bar dataKey="amount" name="Pipeline" fill="#EAB308" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-[#F9F9F9] flex items-center justify-between">
            <div>
              <div className="font-semibold text-[13px] text-gray-800">Overdue &amp; Due-Today Leads</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Closure date ≤ today · not yet converted · {closureLeads.length} total</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-400 uppercase font-semibold">Total Pipeline</div>
              <div className="font-mono font-bold text-[#EAB308] text-[14px]">{fmtINR(closureTotalAmount)}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100 bg-[#F9F9F9]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lead ID</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Branch</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">BM</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Closure Date</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading && closureLeads.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-gray-400">Loading…</td></tr>
                )}
                {!loading && closureLeads.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-gray-400">No overdue or due-today leads</td></tr>
                )}
                {closurePagedRows.map((l, i) => {
                  const isToday = l.closureDate === today;
                  return (
                    <tr key={l.id + l.clientPhone} className={`border-b border-gray-50 hover:bg-gray-50 ${isToday ? 'bg-amber-50' : 'bg-red-50/40'}`}>
                      <td className="px-3 py-2 text-gray-400 text-[10px]">{closurePage$ * CLOSURE_PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{l.id}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{l.clientName || '—'}</td>
                      <td className="px-3 py-2"><span className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full">{l.branch}</span></td>
                      <td className="px-3 py-2 text-gray-600">{l.assignedTo || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[11px] font-semibold ${isToday ? 'text-amber-600' : 'text-red-500'}`}>
                          {fmtDate(l.closureDate)}{isToday ? ' · Today' : ' · Overdue'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-500">{l.status || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#EAB308] text-[11px]">{fmtINR(l.cartValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {closureLeads.length > 0 && (
                <tfoot>
                  <tr className="bg-[#F9F9F9] border-t border-gray-200">
                    <td colSpan={7} className="px-3 py-2 text-[10px] font-semibold text-gray-500">Total · {closureLeads.length} leads</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#EAB308] text-[12px]">{fmtINR(closureTotalAmount)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {closureTotalPages > 1 && (
            <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Showing {closurePage$ * CLOSURE_PAGE_SIZE + 1}–{Math.min((closurePage$ + 1) * CLOSURE_PAGE_SIZE, closureLeads.length)} of {closureLeads.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setClosurePage(0)} disabled={closurePage$ === 0} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">First</button>
                <button onClick={() => setClosurePage(p => Math.max(0, p - 1))} disabled={closurePage$ === 0} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Prev</button>
                <span className="text-[11px] text-gray-500 px-2">Page {closurePage$ + 1} of {closureTotalPages}</span>
                <button onClick={() => setClosurePage(p => Math.min(closureTotalPages - 1, p + 1))} disabled={closurePage$ >= closureTotalPages - 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Next</button>
                <button onClick={() => setClosurePage(closureTotalPages - 1)} disabled={closurePage$ >= closureTotalPages - 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Last</button>
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
      )}
    </div>
  );
}

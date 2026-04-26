'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { ActivityLog } from '@/types/crm';
import {
  fetchDashboardData,
  type DashboardData,
  type DashboardBranchStatus,
  type DashboardLostReason,
  type DashboardClosureLead,
} from '@/lib/mockApi';

const fmtINR = (n?: number | null) => {
  if (!n) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
};

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const fmtRelative = (isoStr?: string | null) => {
  if (!isoStr) return 'Never Edited';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(isoStr.slice(0, 10));
};

const LOST_COLORS = ['#EF4444','#F97316','#EAB308','#22C55E','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F59E0B','#6366F1'];
const STATUS_COLORS: Record<string, string> = {
  'Quote Approval Pending': '#3B82F6',
  'Request for Availability Check': '#8B5CF6',
  'Site Visit': '#A855F7',
  'Order Placed': '#EAB308',
  'Partly Placed': '#FB923C',
  'Delivered': '#22C55E',
  'Order Lost': '#EF4444',
  'Refunded': '#F97316',
};
const DEFAULT_STATUS_COLOR = '#9CA3AF';
const EDIT_ACTIONS = ['updated_lead', 'date_changed', 'added_remark', 'status_changed'];

interface UserStat { name: string; edits: number; total: number; lastSeen: string }
interface WeekDay { day: string; amount: number; count: number }
interface DateRange { from: string; to: string }

interface BranchPieTooltipProps {
  active?: boolean;
  payload?: { payload: { status: string; count: number; value: number } }[];
  total: number;
}

function BranchPieTooltip({ active, payload, total }: BranchPieTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
  return (
    <div className="bg-[#1A1A1A] text-white px-3 py-2.5 rounded-lg shadow-xl text-[11px] min-w-[160px]">
      <div className="font-bold mb-1.5 text-[#EAB308]">{d.status}</div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Leads</span><span className="font-semibold">{d.count} ({pct}%)</span></div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Value</span><span className="font-semibold font-mono">{fmtINR(d.value)}</span></div>
    </div>
  );
}

interface LostPieTooltipProps {
  active?: boolean;
  payload?: { payload: DashboardLostReason }[];
}

function LostPieTooltip({ active, payload }: LostPieTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1A1A1A] text-white px-3 py-2.5 rounded-lg shadow-xl text-[11px] min-w-[160px]">
      <div className="font-bold mb-1.5 text-[#EAB308]">{d.reason}</div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Leads</span><span className="font-semibold">{d.count} · {d.pct}%</span></div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Value</span><span className="font-semibold font-mono">{fmtINR(d.value)}</span></div>
    </div>
  );
}

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
              <input type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })}
                className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none" />
              <span className="text-gray-400">–</span>
              <input type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })}
                className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none" />
            </div>
            {(value.from || value.to) && (
              <button onClick={() => { onChange({ from: '', to: '' }); setOpen(false); }}
                className="text-[11px] text-red-500 hover:text-red-600 cursor-pointer bg-transparent border-none p-0">
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  );
}

interface DashboardProps {
  logs: ActivityLog[];
  branches: string[];
}

export default function Dashboard({ logs, branches }: DashboardProps) {
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const [closureDate, setClosureDate] = useState<DateRange>({ from: '', to: '' });
  const [createdDate, setCreatedDate] = useState<DateRange>({ from: '', to: '' });
  const hasFilters = branchFilter.length > 0 || bmFilter.length > 0 || closureDate.from || closureDate.to || createdDate.from || createdDate.to;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const branchOptions = useMemo(() => branches.filter(b => b !== 'HQ'), [branches]);

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
      load({
        branch: branchFilter.length ? branchFilter : undefined,
        bm: bmFilter.length ? bmFilter : undefined,
        closureFrom: closureDate.from || undefined,
        closureTo: closureDate.to || undefined,
        createdFrom: createdDate.from || undefined,
        createdTo: createdDate.to || undefined,
      });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmFilter, closureDate, createdDate, load]);

  const availableBMs = data?.availableBMs ?? [];
  const summary = data?.summary;
  const branchStatusData: DashboardBranchStatus[] = data?.branchStatus ?? [];
  const lostData: DashboardLostReason[] = data?.lostReasons ?? [];
  const closureLeads: DashboardClosureLead[] = data?.closurePipeline ?? [];

  const today = summary?.today ?? new Date().toISOString().slice(0, 10);
  const weekFrom = summary?.weekFrom ?? '';
  const weekTo = summary?.weekTo ?? '';

  const leaderboard = useMemo((): UserStat[] => {
    const userMap: Record<string, UserStat> = {};
    logs.forEach(log => {
      if (!log.user_name) return;
      if (!userMap[log.user_name]) userMap[log.user_name] = { name: log.user_name, edits: 0, total: 0, lastSeen: '' };
      userMap[log.user_name].total++;
      if (EDIT_ACTIONS.includes(log.action)) userMap[log.user_name].edits++;
      if (!userMap[log.user_name].lastSeen || log.created_at > userMap[log.user_name].lastSeen)
        userMap[log.user_name].lastSeen = log.created_at;
    });
    return Object.values(userMap).sort((a, b) => b.edits - a.edits);
  }, [logs]);

  const totalEdits = leaderboard.reduce((s, u) => s + u.edits, 0) || 1;

  const mostRecentUser = useMemo(() => {
    if (!leaderboard.length) return null;
    return [...leaderboard].sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))[0]?.name;
  }, [leaderboard]);

  const userInsight = useMemo(() => {
    if (!leaderboard.length) return {} as Record<string, { emoji: string; text: string }>;
    const map: Record<string, { emoji: string; text: string }> = {};
    const top3Share = leaderboard.slice(0, 3).reduce((s, u) => s + u.edits, 0);
    leaderboard.forEach((u, i) => {
      const pct = Math.round((u.edits / totalEdits) * 100);
      if (i === 0) { map[u.name] = { emoji: '🏆', text: `Carrying the team · ${pct}% of all edits` }; return; }
      if (u.edits === 0) { map[u.name] = { emoji: '😴', text: 'Logged in, 0 edits so far' }; return; }
      if (u.name === mostRecentUser && i !== 0) { map[u.name] = { emoji: '⚡', text: 'Most recent action in CRM' }; return; }
      if (i < 3) { map[u.name] = { emoji: '🎯', text: `Top 3 · ${Math.round((top3Share / totalEdits) * 100)}% share combined` }; return; }
    });
    return map;
  }, [leaderboard, totalEdits, mostRecentUser]);

  const [lbPage, setLbPage] = useState(0);
  const LB_PAGE_SIZE = 5;
  const lbTotalPages = Math.ceil(leaderboard.length / LB_PAGE_SIZE) || 1;
  const lbPage$ = Math.min(lbPage, lbTotalPages - 1);
  const lbPagedRows = leaderboard.slice(lbPage$ * LB_PAGE_SIZE, (lbPage$ + 1) * LB_PAGE_SIZE);

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
    <div className="px-6 py-5 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip label="Branch" options={branchOptions} selected={branchFilter} onChange={v => { setBranchFilter(v); setBmFilter([]); }} color={{ active: '#3B82F6' }} />
        <FilterChip label="BM" options={availableBMs} selected={bmFilter} onChange={setBmFilter} color={{ active: '#8B5CF6' }} />
        <DateChip label="Closure Date" value={closureDate} onChange={setClosureDate} color={{ active: '#F59E0B' }} />
        <DateChip label="Created Date" value={createdDate} onChange={setCreatedDate} color={{ active: '#22C55E' }} />
        {hasFilters && (
          <button onClick={() => { setBranchFilter([]); setBmFilter([]); setClosureDate({ from:'', to:'' }); setCreatedDate({ from:'', to:'' }); }}
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
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(branchStatusData.length, 4)}, 1fr)` }}>
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
        <SectionHeader title="Activity Leaderboard" sub={`${logs.length} actions logged · who's putting in the work?`} />
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-[#F9F9F9] flex items-center justify-between">
            <div>
              <div className="font-semibold text-[13px] text-gray-800">Most Active Users</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Ranked by edits · updates, remarks, date & status changes</div>
            </div>
            <div className="text-[11px] text-gray-400">{leaderboard.length} users</div>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-10">Rank</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Edits</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Actions</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Insight</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Seen</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Share</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-36">Progress</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-gray-400">No activity data</td></tr>}
              {lbPagedRows.map(u => {
                const rank = leaderboard.indexOf(u);
                const sharePct = Math.round((u.edits / totalEdits) * 100);
                const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}`;
                const barColor = rank === 0 ? '#EAB308' : rank === 1 ? '#9CA3AF' : rank === 2 ? '#B45309' : '#D1D5DB';
                const insight = userInsight[u.name];
                return (
                  <tr key={u.name} className={`border-b border-gray-50 hover:bg-gray-50 ${rank === 0 ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2.5 text-center text-[13px]">{medal}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{u.name}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-700">{u.edits}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-400">{u.total}</td>
                    <td className="px-4 py-2.5">
                      {insight
                        ? <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{insight.emoji} {insight.text}</span>
                        : <span className="text-[11px] text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-400">{fmtRelative(u.lastSeen)}</td>
                    <td className="px-4 py-2.5 font-bold" style={{ color: rank === 0 ? '#EAB308' : '#374151' }}>{sharePct}%</td>
                    <td className="px-4 py-2.5">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${sharePct}%`, background: barColor }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lbTotalPages > 1 && (
            <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Showing {lbPage$ * LB_PAGE_SIZE + 1}–{Math.min((lbPage$ + 1) * LB_PAGE_SIZE, leaderboard.length)} of {leaderboard.length}</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: lbTotalPages }, (_, i) => (
                  <button key={i} onClick={() => setLbPage(i)}
                    className={`w-6 h-6 text-[11px] rounded border cursor-pointer ${lbPage$ === i ? 'bg-[#EAB308] text-black border-[#EAB308] font-bold' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Lost Reasons" sub={`${lostLeadsCount} orders lost · ${fmtINR(lostLeadsValue)} pipeline lost`} />
        {loading && lostData.length === 0
          ? <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-[12px] text-gray-400">Loading…</div>
          : lostData.length === 0
            ? <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-[12px] text-gray-400">No lost orders match current filters</div>
            : (
              <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-3 mb-4">
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
          <div className="px-5 py-3 border-b border-gray-100 bg-[#F9F9F9] flex items-center justify-between">
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
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CategoryOption,
  ClosureClient,
  ClosureStage,
  fetchAvailableBMs,
  fetchCategoryOptions,
  fetchReportCard,
  PipelineCartRow,
  RankingRow,
  ReportCardBMOption,
  ReportCardData,
  WalkinRow,
} from '@/lib/mockApi';

interface Props {
  branches: string[];
  allowedBranches: string[];
  currentUserPhone?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtMoney = (n: number) =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(2)} Cr`
    : n >= 100000
    ? `₹${(n / 100000).toFixed(1)} L`
    : `₹${Math.round(n).toLocaleString('en-IN')}`;

const fmtPct = (n: number) => `${(n ?? 0).toFixed(1)}%`;
const fmtNum = (n: number) => (n ?? 0).toLocaleString('en-IN');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
};
const fmtDateShort = (iso: string) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${MONTH_SHORT[m - 1]} ${String(d).padStart(2, '0')}`;
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthStartISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const monthEndISO = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

// ── Section shell ───────────────────────────────────────────────────────────────

function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center text-[10px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 tracking-widest">{n}</span>
          <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
        </div>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

const stagePill: Record<ClosureStage, string> = {
  HOT: 'bg-red-50 text-red-600',
  WARM: 'bg-amber-50 text-amber-600',
  COLD: 'bg-blue-50 text-blue-600',
  DEAD: 'bg-gray-100 text-gray-500',
};

// ── Filter primitives ───────────────────────────────────────────────────────────

function Dropdown({
  value, placeholder, options, onChange, searchable,
}: {
  value: string; placeholder: string; options: { label: string; value: string }[];
  onChange: (v: string) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = options.find(o => o.value === value);
  const visible = searchable && q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className="flex items-center justify-between gap-2 min-w-[140px] px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
      >
        <span className={sel ? '' : 'text-gray-400'}>{sel ? sel.label : placeholder}</span>
        <span className="text-[10px] text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[180px] max-h-[260px] overflow-y-auto flex flex-col">
            {searchable && (
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  placeholder="Search…"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] outline-none" />
              </div>
            )}
            {visible.map(o => (
              <button key={o.value || '_all'} onClick={() => { onChange(o.value); setOpen(false); }}
                className={`text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer ${o.value === value ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700'}`}>
                {o.label}
              </button>
            ))}
            {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>}
          </div>
        </>
      )}
    </div>
  );
}

function MultiDropdown({
  values, placeholder, options, onChange, searchable,
}: {
  values: string[]; placeholder: string; options: { label: string; value: string }[];
  onChange: (v: string[]) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const visible = searchable && q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  const label = values.length === 0
    ? placeholder
    : values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? values[0])
      : `${values.length} selected`;
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className="flex items-center justify-between gap-2 min-w-[140px] px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
      >
        <span className={values.length ? '' : 'text-gray-400'}>{label}</span>
        <span className="text-[10px] text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[180px] max-h-[260px] overflow-y-auto flex flex-col">
            {searchable && (
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  placeholder="Search…"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] outline-none" />
              </div>
            )}
            {values.length > 0 && (
              <button onClick={() => onChange([])}
                className="text-left px-3 py-1.5 text-[12px] text-gray-500 hover:bg-gray-50 border-b border-gray-100 cursor-pointer">
                Clear all
              </button>
            )}
            {visible.map(o => {
              const checked = values.includes(o.value);
              return (
                <button key={o.value || '_all'} onClick={() => toggle(o.value)}
                  className={`flex items-center gap-2 text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer ${checked ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700'}`}>
                  <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border text-[9px] leading-none ${checked ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
                  {o.label}
                </button>
              );
            })}
            {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Section 01: Walk-in Attendance ──────────────────────────────────────────────

function WalkinTable({ w }: { w: ReportCardData['walkin_analysis'] }) {
  const total = w.total;
  const rows: { key: keyof ReportCardData['walkin_analysis']; label: string; sub: string; tint: string; color: string; row: WalkinRow }[] = [
    { key: 'total', label: 'Total Unique Walkins', sub: 'All footfall attended · date range', tint: 'bg-amber-50/40', color: 'text-amber-600', row: w.total },
    { key: 'new', label: 'New Walkins', sub: 'First-time visitors', tint: 'bg-green-50/40', color: 'text-green-700', row: w.new },
    { key: 'old', label: 'Old Walkins', sub: 'Repeat visitors (2nd visit onwards)', tint: 'bg-blue-50/40', color: 'text-blue-700', row: w.old },
    { key: 'no_walkin', label: 'No Walkins', sub: 'Orders placed remotely without store visit', tint: '', color: 'text-gray-400', row: w.no_walkin },
  ];
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '0%');
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
      <table className="w-full min-w-[860px] border-collapse">
        <thead className="border-b border-gray-100">
          <tr>
            <Th>Walkin Type</Th><Th right>Walkins</Th><Th right>Carts Created</Th><Th right>Cart Creation %</Th>
            <Th right>Total Orders</Th><Th right>Total Sale Value</Th><Th right>Avg AOV</Th><Th right>Conversion %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, sub, tint, color, row }) => (
            <tr key={key} className={`border-b border-gray-50 last:border-0 ${tint}`}>
              <td className="px-4 py-3">
                <div className={`text-[13px] font-bold ${key === 'total' ? 'text-gray-900' : color}`}>{label}</div>
                <div className="text-[11px] text-gray-400">{sub}</div>
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.walkins)}
                {key !== 'total' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.walkins, total.walkins)} of total</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.carts_created)}
                {key !== 'total' && key !== 'no_walkin' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.carts_created, total.carts_created)} of total carts</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>{fmtPct(row.cart_creation_pct)}</td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.total_orders)}
                {key !== 'total' && key !== 'no_walkin' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.total_orders, total.total_orders)} of orders</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {row.total_sale_value ? fmtMoney(row.total_sale_value) : '₹0'}
                {key !== 'total' && key !== 'no_walkin' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.total_sale_value, total.total_sale_value)} of value</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>{row.avg_aov ? fmtMoney(row.avg_aov) : '—'}</td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>{row.total_orders ? fmtPct(row.conversion_pct) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section 02: Pipeline carts ──────────────────────────────────────────────────

function PipelineTable({ p }: { p: ReportCardData['pipeline_carts'] }) {
  const rows: { key: keyof ReportCardData['pipeline_carts']; label: string; sub: string; tint: string; color: string; row: PipelineCartRow }[] = [
    { key: 'total', label: 'Total Carts', sub: 'Open carts — not lost, not ordered', tint: 'bg-blue-50/30', color: 'text-blue-700', row: p.total },
    { key: 'active', label: 'Active Carts', sub: '0 – 7 days since last update', tint: 'bg-green-50/30', color: 'text-green-700', row: p.active },
    { key: 'warm', label: 'Warm Carts', sub: '8 – 14 days since last update', tint: 'bg-green-50/20', color: 'text-green-600', row: p.warm },
    { key: 'cold', label: 'Cold Carts', sub: '15 – 30 days since last update', tint: '', color: 'text-blue-600', row: p.cold },
    { key: 'dead', label: 'Dead Carts', sub: '> 30 days since last update', tint: 'bg-red-50/30', color: 'text-red-600', row: p.dead },
  ];
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white max-w-lg">
      <table className="w-full min-w-[420px] border-collapse">
        <thead className="border-b border-gray-100">
          <tr><Th>Cart Category</Th><Th right>No. of Carts</Th><Th right>Live Pipeline Value</Th></tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, sub, tint, color, row }) => (
            <tr key={key} className={`border-b border-gray-50 last:border-0 ${tint}`}>
              <td className="px-4 py-3">
                <div className={`text-[13px] font-bold ${key === 'total' ? 'text-gray-900' : color}`}>{label}</div>
                <div className="text-[11px] text-gray-400">{sub}</div>
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.count)}<div className="text-[10px] text-gray-400 font-normal">({row.count_pct}%)</div>
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtMoney(row.value)}<div className="text-[10px] text-gray-400 font-normal">({row.value_pct}%)</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section 03: Orders lost ─────────────────────────────────────────────────────

function OrdersLostTable({ o }: { o: ReportCardData['orders_lost'] }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white max-w-lg">
      <table className="w-full min-w-[420px] border-collapse">
        <thead className="border-b border-gray-100">
          <tr><Th>Reason</Th><Th right>No. of Orders Lost</Th><Th right>Value Lost</Th></tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-50 bg-red-50/40">
            <td className="px-4 py-3 text-[13px] font-bold text-red-600">Total Orders Lost</td>
            <td className="px-4 py-3 text-right font-mono text-[13px] font-bold text-red-600">{fmtNum(o.total.count)}<div className="text-[10px] text-gray-400 font-normal">(100%)</div></td>
            <td className="px-4 py-3 text-right font-mono text-[13px] font-bold text-red-600">{fmtMoney(o.total.value)}<div className="text-[10px] text-gray-400 font-normal">(100%)</div></td>
          </tr>
          {o.reasons.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-6 text-center text-[12px] text-gray-400">No lost orders in range</td></tr>
          )}
          {o.reasons.map(r => (
            <tr key={r.key} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-3 text-[13px] text-gray-700">{r.label}</td>
              <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold text-gray-800">{fmtNum(r.count)}<div className="text-[10px] text-gray-400 font-normal">({r.count_pct}%)</div></td>
              <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold text-gray-800">{fmtMoney(r.value)}<div className="text-[10px] text-gray-400 font-normal">({r.value_pct}%)</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section 04: CRM adherence ───────────────────────────────────────────────────

function AvgWalkinCard({ label, bm, store, accent, range }: { label: string; bm: number; store: number; accent: string; range: string }) {
  return (
    <div className="flex-1 min-w-[220px] bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="h-1" style={{ background: accent }} />
      <div className="p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="flex items-end gap-6 mt-2">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">This BM</div>
            <div className="font-mono text-4xl font-bold" style={{ color: accent }}>{bm.toFixed(1)}</div>
          </div>
          <div className="pb-1 border-l border-gray-100 pl-6">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Store Avg</div>
            <div className="font-mono text-2xl font-bold text-gray-400">{store.toFixed(1)}</div>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 mt-3">{range}</div>
      </div>
    </div>
  );
}

function CrmAdherenceSection({ c, range }: { c: ReportCardData['crm_adherence']; range: string }) {
  const metrics = [
    { label: 'Follow Up Completion %', sub: "% of this BM's carts updated with a follow-up date", value: fmtPct(c.follow_up_completion_pct) },
    { label: 'User Info Completion %', sub: "% of this BM's carts with client details filled", value: fmtPct(c.user_info_completion_pct) },
    { label: 'TAT', sub: 'Avg. time from walkin to CRM entry', value: `${c.tat_hours} hrs` },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="border-b border-gray-100"><tr><Th>CRM Metric</Th><Th right>Value</Th></tr></thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.label} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3"><div className="text-[13px] font-semibold text-gray-800">{m.label}</div><div className="text-[11px] text-gray-400">{m.sub}</div></td>
                <td className="px-4 py-3 text-right font-mono text-[14px] font-bold text-green-600">{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 flex-wrap">
        <AvgWalkinCard label="Avg Weekday Walkin" bm={c.avg_weekday_walkin.bm} store={c.avg_weekday_walkin.store} accent="#3B82F6" range={`per weekday · ${range}`} />
        <AvgWalkinCard label="Avg Weekend Walkin" bm={c.avg_weekend_walkin.bm} store={c.avg_weekend_walkin.store} accent="#F59E0B" range={`per weekend day · ${range}`} />
      </div>
    </div>
  );
}

// ── Section 05: Closure pipeline ────────────────────────────────────────────────

function PhoneCell({ phone }: { phone: string }) {
  return (
    <span className="font-mono text-[12px] text-gray-600">{phone || '—'}</span>
  );
}

const CLOSURE_PAGE_SIZE = 25;

function ClosurePipelineSection({
  clients, catOptions,
}: { clients: ClosureClient[]; catOptions: string[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cat, setCat] = useState<string[]>([]);
  const [stage, setStage] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const filtered = useMemo(() => {
    const catLower = cat.map(x => x.toLowerCase());
    return clients.filter(c => {
      if (from && c.closure_date < from) return false;
      if (to && c.closure_date > to) return false;
      if (catLower.length && !c.categories.some(x => catLower.includes(x.toLowerCase()))) return false;
      if (stage.length && !stage.includes(c.stage)) return false;
      const vL = c.cart_value / 100000;
      if (min && vL < parseFloat(min)) return false;
      if (max && vL > parseFloat(max)) return false;
      return true;
    });
  }, [clients, from, to, cat, stage, min, max]);

  const totalPipeline = filtered.reduce((s, c) => s + c.cart_value, 0);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [from, to, cat, stage, min, max, clients]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / CLOSURE_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * CLOSURE_PAGE_SIZE, pageClamped * CLOSURE_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Closure Date</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="text-gray-300">—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <MultiDropdown values={cat} placeholder="All Categories" onChange={setCat}
          options={catOptions.map(c => ({ label: c, value: c }))} searchable />
        <MultiDropdown values={stage} placeholder="All Stages" onChange={setStage}
          options={(['HOT', 'WARM', 'COLD', 'DEAD'] as const).map(s => ({ label: s, value: s }))} />
        <input value={min} onChange={e => setMin(e.target.value)} placeholder="Min" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px]" />
        <span className="text-gray-300 text-[11px]">Cart Value (L) —</span>
        <input value={max} onChange={e => setMax(e.target.value)} placeholder="Max" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px]" />
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr>
              <Th>Client Name</Th><Th>Phone</Th><Th>Categories</Th><Th>Closure Date</Th>
              <Th right>Cart Value</Th><Th>BM</Th><Th>Store</Th><Th>Stage</Th><Th>Last Follow-up</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[12px] text-gray-400">No clients match these filters</td></tr>
            )}
            {pageRows.map((c, i) => (
              <tr key={`${c.phone}-${(pageClamped - 1) * CLOSURE_PAGE_SIZE + i}`} className={`border-b border-gray-50 last:border-0 ${c.stage === 'HOT' ? 'bg-red-50/20' : ''}`}>
                <td className="px-4 py-3 text-[13px] font-semibold text-gray-800">{c.client_name}</td>
                <td className="px-4 py-3"><PhoneCell phone={c.phone} /></td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{c.categories.join(' · ') || '—'}</td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-700">{fmtDate(c.closure_date)}</td>
                <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-gray-800">{fmtMoney(c.cart_value)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{c.bm}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{c.store}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${stagePill[c.stage]}`}>{c.stage}</span></td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500">{fmtDateShort(c.last_followup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-gray-400">
          {filtered.length === 0
            ? 'No clients'
            : `Showing ${(pageClamped - 1) * CLOSURE_PAGE_SIZE + 1}–${Math.min(pageClamped * CLOSURE_PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          {' · '}Total pipeline: {fmtMoney(totalPipeline)}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pageClamped <= 1}
              className="px-2.5 py-1 text-[12px] rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">
              Prev
            </button>
            <span className="text-[11px] text-gray-500 px-1">Page {pageClamped} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={pageClamped >= totalPages}
              className="px-2.5 py-1 text-[12px] rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 06: Rankings ────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
    : rank === 2 ? 'bg-gray-100 text-gray-600 border-gray-300'
    : rank === 3 ? 'bg-orange-50 text-orange-600 border-orange-200'
    : 'bg-white text-gray-400 border-gray-200';
  return <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-bold ${color}`}>{rank}</span>;
}

function RankingTable({ title, rows, showStore }: { title: string; rows: RankingRow[]; showStore?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr>
              <Th>Rank</Th><Th>BM Name</Th>{showStore && <Th>Store</Th>}
              <Th right>Walkins</Th><Th right>Conv %</Th><Th right>Cart %</Th><Th right>Sale Value</Th><Th right>FU %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={showStore ? 8 : 7} className="px-4 py-6 text-center text-[12px] text-gray-400">No data</td></tr>}
            {rows.map(r => (
              <tr key={`${r.rank}-${r.bm_name}`} className={`border-b border-gray-50 last:border-0 ${r.is_selected ? 'bg-amber-50/60' : ''}`}>
                <td className="px-4 py-2.5"><RankBadge rank={r.rank} /></td>
                <td className={`px-4 py-2.5 text-[13px] font-semibold ${r.is_selected ? 'text-amber-600' : 'text-gray-800'}`}>{r.bm_name}</td>
                {showStore && <td className="px-4 py-2.5 text-[12px] text-gray-400">{r.store}</td>}
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtNum(r.walkins)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtPct(r.conv_pct)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtPct(r.cart_pct)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtMoney(r.sale_value)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtPct(r.fu_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export default function ReportCardDashboard({ branches, allowedBranches, currentUserPhone }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');

  const [dateFrom, setDateFrom] = useState(monthStartISO);
  const [dateTo, setDateTo] = useState(monthEndISO);
  const [store, setStore] = useState('');
  const [bmLabel, setBmLabel] = useState('');
  const [bmContact, setBmContact] = useState('');
  const [category, setCategory] = useState('');

  const [data, setData] = useState<ReportCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bmList, setBmList] = useState<ReportCardBMOption[]>([]);
  const [catList, setCatList] = useState<CategoryOption[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchCategoryOptions().then(setCatList).catch(() => setCatList([])); }, []);

  const branchKey = store || '';
  useEffect(() => {
    const eff = branchKey ? [branchKey] : (isRestricted ? allowedBranches : undefined);
    fetchAvailableBMs(eff).then(setBmList).catch(() => setBmList([]));
  }, [branchKey, isRestricted, allowedBranches]);

  // Auto-select a BM once the list loads (this is a per-BM report card, so with
  // no BM selected every section is empty). Prefer the logged-in BM, else first.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || bmContact || bmList.length === 0) return;
    const mine = currentUserPhone
      ? bmList.find(b => b.contact === currentUserPhone || b.contact === currentUserPhone.replace(/^(\+?91)/, ''))
      : undefined;
    const pick = mine ?? bmList[0];
    setBmContact(pick.contact);
    setBmLabel(pick.name);
    autoPicked.current = true;
  }, [bmList, bmContact, currentUserPhone]);

  const load = useCallback(() => {
    setLoading(true);
    fetchReportCard({
      bm: bmContact.trim() || undefined,
      branch: store ? [store] : undefined,
      dateFrom, dateTo,
      category: category || undefined,
    }).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [bmContact, store, dateFrom, dateTo, category]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load]);

  const reset = () => {
    setDateFrom(monthStartISO()); setDateTo(monthEndISO());
    setStore(''); setBmLabel(''); setBmContact(''); setCategory('');
  };

  const rangeLabel = data?.meta
    ? `${fmtDate(data.meta.date_from)} – ${fmtDate(data.meta.date_to)}`
    : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
  const catNames = catList.map(c => c.name);

  return (
    <div className="px-3 sm:px-6 py-4 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Material Depot · Internal Analytics</div>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">BM Report Card</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          {data?.meta?.has_bm
            ? <>Performance snapshot for <span className="font-semibold text-gray-700">{data.meta.bm_name}</span>{data.meta.store && <> · {data.meta.store}</>} · {rangeLabel}</>
            : <>Select a BM to see their performance snapshot · {rangeLabel}</>}
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm sticky top-0 z-40">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Date</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="text-gray-300">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <Dropdown value={store} placeholder="All Stores" onChange={v => { setStore(v); }}
          options={[{ label: 'All Stores', value: '' }, ...branchOptions.map(b => ({ label: b, value: b }))]} searchable />
        <Dropdown value={bmContact} placeholder="Select BM" searchable
          onChange={v => { const o = bmList.find(x => x.contact === v); setBmContact(v); setBmLabel(o?.name ?? ''); }}
          options={[{ label: 'Select BM', value: '' }, ...bmList.map(b => ({ label: `${b.name}${b.contact ? ` · ${b.contact}` : ''}`, value: b.contact }))]} />
        <Dropdown value={category} placeholder="All Categories" onChange={setCategory} searchable
          options={[{ label: 'All Categories', value: '' }, ...catNames.map(c => ({ label: c, value: c }))]} />
        <button onClick={reset} className="ml-auto text-[12px] font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer">Reset Filters</button>
        {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
      </div>

      {/* Content */}
      {loading && !data && <div className="py-16 text-center text-[13px] text-gray-400">Loading…</div>}
      {!loading && !data && <div className="py-16 text-center text-[13px] text-gray-400">Failed to load data. Check filters and try again.</div>}

      {data && (
        <div className={`space-y-8 transition-opacity duration-150 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <Section n="01" title="Walkin Attendance & Conversion" hint="Footfall breakdown · cart creation · revenue conversion">
            <WalkinTable w={data.walkin_analysis} />
          </Section>
          <Section n="02" title="Pipeline Cart Breakdown" hint="All open carts not yet won or lost · as of today">
            <PipelineTable p={data.pipeline_carts} />
          </Section>
          <Section n="03" title="Orders Lost Breakdown" hint="Lost count & value by reason">
            <OrdersLostTable o={data.orders_lost} />
          </Section>
          <Section n="04" title="CRM Adherence & Walkin Averages" hint="Follow-up discipline · turnaround time · footfall patterns">
            <CrmAdherenceSection c={data.crm_adherence} range={rangeLabel} />
          </Section>
          <Section n="05" title="Closure Pipeline" hint="Clients with expected closure in selected range">
            <ClosurePipelineSection clients={data.closure_pipeline.clients} catOptions={catNames} />
          </Section>
          <Section n="06" title="BM Rankings" hint="How the selected BM compares to peers · highlighted row = selected BM">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RankingTable title="Company-Wide" rows={data.rankings.company_wide} showStore />
              <RankingTable title={data.meta.store ? `Within ${data.meta.store}` : 'Within Store'} rows={data.rankings.within_store} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

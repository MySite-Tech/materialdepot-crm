'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  fetchNPSTracker, submitNPS,
  type NPSRow,
} from '@/lib/mockApi';

const Q3_OPTIONS = [
  'Pricing / Budget Expectations',
  'Collection / Product Preference',
  'Service & Delivery Timelines',
  'Sales Experience',
];

// ── palette ────────────────────────────────────────────────────────────────
const C = {
  promoter: '#22C55E',
  passive: '#EAB308',
  detractor: '#EF4444',
  line: '#2A78D6',
  bm: '#8B5CF6',
  grid: '#F0F0F0',
  axis: '#9CA3AF',
};

const PILL = 'flex items-center gap-2 h-9 px-3.5 rounded-full bg-white border border-gray-300 text-gray-800 text-[13px] font-semibold hover:border-gray-400 cursor-pointer whitespace-nowrap';

// ── NPS helpers ───────────────────────────────────────────────────────────────
type Bucket = 'Promoter' | 'Passive' | 'Detractor';
const bucketOf = (score: number): Bucket =>
  score >= 9 ? 'Promoter' : score >= 7 ? 'Passive' : 'Detractor';
type Cat = 'promoter' | 'passive' | 'detractor';
const catOf = (score: number): Cat =>
  score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';

const BUCKET_STYLE: Record<Bucket, string> = {
  Promoter: 'bg-green-50 text-green-700',
  Passive: 'bg-amber-50 text-amber-700',
  Detractor: 'bg-red-50 text-red-700',
};
const BUCKET_TEXT: Record<Bucket, string> = {
  Promoter: 'text-green-600',
  Passive: 'text-amber-600',
  Detractor: 'text-red-600',
};

const isSubmitted = (r: NPSRow) => r.status === 'submitted' && r.score != null;

// A customer holds one review, which the tracker attaches to every visit row of
// theirs. Counting rows would count a repeat visitor once per visit, so anything
// measuring customers or reviews collapses them to their latest visit first.
const customerKey = (r: NPSRow) => (r.contact != null ? `c:${r.contact}` : `f:${r.id}`);
const visitedAt = (r: NPSRow) => `${r.visit_date} ${r.time}`;

function uniqueCustomers(rows: NPSRow[]): NPSRow[] {
  const latest: Record<string, NPSRow> = {};
  rows.forEach(r => {
    const k = customerKey(r);
    if (!latest[k] || visitedAt(r) > visitedAt(latest[k])) latest[k] = r;
  });
  return Object.values(latest);
}
const uniqueReviews = (rows: NPSRow[]) => uniqueCustomers(rows.filter(isSubmitted));

const fmtDate = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtPhone = (c: number | null) => (c == null ? '—' : `+91 ${c}`);
const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${n}`;

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => toISO(new Date());
const monthStartISO = () => { const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth(), 1)); };
const addDaysISO = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetweenISO = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
const daysSince = (visitDate: string) => (visitDate ? daysBetweenISO(visitDate, todayISO()) : 0);

const DATE_PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thismonth', label: 'This month' },
];
function presetRange(key: string): { from: string; to: string } {
  const today = todayISO();
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDaysISO(today, -1); return { from: y, to: y }; }
    case 'last7': return { from: addDaysISO(today, -6), to: today };
    case 'last30': return { from: addDaysISO(today, -29), to: today };
    case 'thismonth': return { from: monthStartISO(), to: today };
    default: return { from: addDaysISO(today, -29), to: today };
  }
}

// ── NPS math (client-side, from tracker rows) ──────────────────────────────────
function npsOf(rows: NPSRow[]): number | null {
  const c = uniqueReviews(rows);
  if (!c.length) return null;
  let p = 0, d = 0;
  c.forEach(r => { const b = catOf(r.score!); if (b === 'promoter') p++; else if (b === 'detractor') d++; });
  return Math.round((p / c.length - d / c.length) * 100);
}

type Understood = 'all' | 'yes' | 'no';
type CatFilter = 'all' | Cat;

const okSearch = (r: NPSRow, q: string) => {
  if (!q) return true;
  return (`${r.name || ''} ${fmtPhone(r.contact)}`).toLowerCase().includes(q.toLowerCase());
};
const okBm = (r: NPSRow, bms: string[]) => (bms.length ? bms.includes(r.bm) : true);
const okUnderstood = (r: NPSRow, u: Understood) => {
  if (u === 'all') return true;
  if (!isSubmitted(r)) return false;
  return u === 'yes' ? r.understood === true : r.understood === false;
};
const okCategory = (r: NPSRow, c: CatFilter) => {
  if (c === 'all') return true;
  if (!isSubmitted(r)) return false;
  return catOf(r.score!) === c;
};

interface Metrics {
  nps: number | null; total: number; responseRate: number | null;
  promoterPct: number | null; detractorPct: number | null; avg: number | null;
}
// `base` is already search + BM filtered. responseRate is the conversion of unique
// footfall into unique reviews, so it is measured over the full base (all footfalls)
// and ignores the understood/category chips.
function computeMetrics(base: NPSRow[], u: Understood, c: CatFilter): Metrics {
  const analysis = base.filter(r => okUnderstood(r, u) && okCategory(r, c));
  const completed = uniqueReviews(analysis);
  const total = completed.length;
  const customers = uniqueCustomers(base).length;
  return {
    nps: npsOf(analysis),
    total,
    responseRate: customers ? Math.round(uniqueReviews(base).length / customers * 100) : null,
    promoterPct: total ? Math.round(completed.filter(r => catOf(r.score!) === 'promoter').length / total * 100) : null,
    detractorPct: total ? Math.round(completed.filter(r => catOf(r.score!) === 'detractor').length / total * 100) : null,
    avg: total ? completed.reduce((a, r) => a + r.score!, 0) / total : null,
  };
}

// ── Small UI atoms ────────────────────────────────────────────────────────────
function ResultPill({ score }: { score: number | null }) {
  if (score == null) return <span className="text-gray-300 text-[13px]">--</span>;
  const b = bucketOf(score);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${BUCKET_STYLE[b]}`}>
      <span>{score}</span>
      <span className="opacity-50">·</span>
      <span>{b}</span>
    </span>
  );
}

function WaitChip({ visitDate }: { visitDate: string }) {
  const d = daysSince(visitDate);
  const cls = d >= 3 ? 'bg-red-50 text-red-700' : d >= 1 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600';
  const label = d <= 0 ? 'Today' : d === 1 ? '1 day' : `${d} days`;
  return <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold ${cls}`}>{label}</span>;
}

// dir: +1 higher-is-better, -1 higher-is-worse
function Delta({ cur, prev, unit = '', dir = 1, dec = 0 }: { cur: number | null; prev: number | null; unit?: string; dir?: number; dec?: number }) {
  if (cur == null || prev == null) return <div className="text-[12px] text-gray-400 mt-1.5">no prior period</div>;
  const diff = cur - prev;
  const eps = dec ? 0.05 : 0.5;
  if (Math.abs(diff) < eps) return <div className="text-[12px] text-gray-400 mt-1.5">no change vs prev</div>;
  const good = diff > 0 ? dir > 0 : dir < 0;
  const mag = dec ? Math.abs(diff).toFixed(dec) : String(Math.round(Math.abs(diff)));
  return (
    <div className={`text-[12px] mt-1.5 flex items-center gap-1 font-medium ${good ? 'text-green-600' : 'text-red-600'}`}>
      {diff > 0 ? '▲' : '▼'} {mag}{unit}
      <span className="text-gray-400 font-normal">vs prev</span>
    </div>
  );
}

interface KpiTileProps { label: string; value: string; accent: string; valueClass?: string; delta?: React.ReactNode }
function KpiTile({ label, value, accent, valueClass = '', delta }: KpiTileProps) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 px-5 py-4 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-[30px] leading-none font-bold mt-3 tabular-nums ${valueClass || 'text-gray-900'}`}>{value}</div>
      {delta}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { val: T; label: string }[] }) {
  return (
    <div className="inline-flex bg-white border border-gray-300 rounded-full p-0.5 gap-0.5">
      {options.map(o => (
        <button
          key={o.val}
          onClick={() => onChange(o.val)}
          className={`px-3 py-1 rounded-full text-[12.5px] font-semibold cursor-pointer transition-colors ${value === o.val ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
      {caption && <p className="text-[12px] text-gray-400 mt-0.5 mb-3">{caption}</p>}
      <div className={caption ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

function EmptyChart({ msg }: { msg: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-12">{msg}</div>;
}

// ── Filter pills ──────────────────────────────────────────────────────────────
function MultiDropdown({ label, dot, accent, options, selected, onChange, searchable }: {
  label: string; dot: string; accent: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = searchable && q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  const btnLabel = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div className="relative">
      <button className={PILL} onClick={() => setOpen(o => !o)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
        {btnLabel}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => { setOpen(false); setQ(''); }} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-2 min-w-[240px]">
            {searchable && (
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                className="w-full mb-2 border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-gray-400" />
            )}
            <div className="max-h-[260px] overflow-y-auto flex flex-col">
              {shown.length === 0 && <div className="text-[12.5px] text-gray-400 px-2 py-3 text-center">No options</div>}
              {shown.map(o => {
                const on = selected.includes(o);
                return (
                  <button key={o} onClick={() => toggle(o)} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 text-left text-[13px] text-gray-700 cursor-pointer">
                    <span className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center shrink-0" style={on ? { background: accent, borderColor: accent } : {}}>
                      {on && <span className="text-white text-[10px] leading-none">✓</span>}
                    </span>
                    {o}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between border-t border-gray-100 mt-2 pt-2">
              <button onClick={() => onChange([])} className="text-[13px] font-semibold text-gray-500 hover:text-gray-700 cursor-pointer">Clear</button>
              <button onClick={() => { setOpen(false); setQ(''); }} className="text-[13px] font-semibold text-blue-600 cursor-pointer">Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DateDropdown({ from, to, preset, onApply }: { from: string; to: string; preset: string; onApply: (f: string, t: string, p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  useEffect(() => { setF(from); setT(to); }, [from, to, open]);
  const label = DATE_PRESETS.find(p => p.key === preset)?.label ?? `${from} → ${to}`;
  return (
    <div className="relative">
      <button className={PILL} onClick={() => setOpen(o => !o)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: C.passive }} />
        {label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-2 min-w-[280px]">
            {DATE_PRESETS.map(p => (
              <button key={p.key} onClick={() => { const r = presetRange(p.key); onApply(r.from, r.to, p.key); setOpen(false); }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] hover:bg-gray-50 cursor-pointer ${preset === p.key ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                {p.label}{preset === p.key && <span className="text-blue-500">✓</span>}
              </button>
            ))}
            <div className="flex gap-2 border-t border-gray-100 mt-2 pt-2">
              <input type="date" value={f} onChange={e => setF(e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none" />
              <input type="date" value={t} onChange={e => setT(e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none" />
            </div>
            <button onClick={() => { if (f && t && f <= t) { onApply(f, t, 'custom'); setOpen(false); } }}
              className="w-full mt-2 py-1.5 rounded-md bg-blue-500 text-white text-[13px] font-semibold hover:bg-blue-600 cursor-pointer">Apply custom range</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Survey modal ──────────────────────────────────────────────────────────────
function SurveyModal({ row, onClose, onSubmit }: { row: NPSRow; onClose: () => void; onSubmit: (payload: { footfall_id: number; score: number | null; understood: boolean | null; better: string[]; remark: string }) => Promise<void> }) {
  const [score, setScore] = useState<number | null>(row.score);
  const [understood, setUnderstood] = useState<boolean | null>(row.understood);
  const [better, setBetter] = useState<string[]>(row.better ?? []);
  const [remark, setRemark] = useState(row.remark);
  const [saving, setSaving] = useState(false);

  const bucket = score == null ? null : bucketOf(score);
  const toggleBetter = (opt: string) =>
    setBetter(b => b.includes(opt) ? b.filter(x => x !== opt) : [...b, opt]);

  const save = async () => {
    if (score == null) return;
    setSaving(true);
    try {
      await onSubmit({ footfall_id: row.id, score, understood, better, remark });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-gray-900">NPS Survey</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">Collect feedback from the customer.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1">
        {/* visitor info */}
        <div className="px-6 grid grid-cols-2 gap-y-3 gap-x-6 pb-5">
          {[['Name', row.name || '—'], ['Phone', fmtPhone(row.contact)], ['Store', row.store || '—'], ['BM', row.bm || '—'], ['Visit Date', fmtDate(row.visit_date)]].map(([k, v]) => (
            <div key={k}>
              <div className="text-[12px] text-gray-400">{k}</div>
              <div className="text-[14px] text-gray-900 font-medium mt-0.5">{v}</div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 space-y-6">
          {/* Q1 */}
          <div>
            <div className="text-[15px] font-bold text-gray-900">Q1. How likely are you to recommend Material Depot to a friend? <span className="text-red-500">*</span></div>
            <div className="text-[12px] text-gray-400 mt-0.5">0 = Not at all likely, 10 = Extremely likely</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {Array.from({ length: 11 }, (_, i) => i).map(n => {
                const sel = score === n;
                return (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    className={`w-12 h-11 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${sel ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {bucket && <div className={`text-[13px] font-semibold mt-2 ${BUCKET_TEXT[bucket]}`}>{bucket} ({bucket === 'Promoter' ? '9–10' : bucket === 'Passive' ? '7–8' : '0–6'})</div>}
          </div>

          {/* Q2 */}
          <div>
            <div className="text-[15px] font-bold text-gray-900">Q2. Did our team understand what you were looking for? <span className="text-red-500">*</span></div>
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => { setUnderstood(true); setBetter([]); }}
                className={`px-7 py-2.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${understood === true ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >Yes</button>
              <button
                onClick={() => setUnderstood(false)}
                className={`px-7 py-2.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${understood === false ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >No</button>
            </div>
          </div>

          {/* Q3 — only when Q2 = No */}
          {understood === false && (
          <div>
            <div className="text-[15px] font-bold text-gray-900">Q3. What could we have done better? <span className="text-[13px] font-normal text-gray-400">(optional)</span></div>
            <div className="space-y-2 mt-3">
              {Q3_OPTIONS.map(opt => {
                const checked = better.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggleBetter(opt)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left cursor-pointer transition-colors ${checked ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                      {checked && <span className="text-white text-[10px] leading-none">✓</span>}
                    </span>
                    <span className="text-[14px] text-gray-800 font-medium">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Q4 */}
          <div>
            <div className="text-[15px] font-bold text-gray-900">Q4. Any suggestions for us? <span className="text-[13px] font-normal text-gray-400">(optional)</span></div>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              rows={3}
              className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2 text-[14px] text-gray-800 outline-none focus:border-gray-400 resize-none"
            />
          </div>
        </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2 mr-auto">
            <ResultPill score={score} />
            {row.status === 'submitted' && <span className="text-[13px] text-gray-400">Submitted — you can correct it.</span>}
          </div>
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-[14px] font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 cursor-pointer">Cancel</button>
          <button
            onClick={save}
            disabled={score == null || saving}
            className="px-6 py-2 rounded-lg text-[14px] font-semibold text-white bg-gray-900 hover:bg-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >{saving ? 'Saving…' : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
interface NPSDashboardProps {
  branches?: string[];
  allowedBranches?: string[];
}

type SortKey = 'name' | 'contact' | 'store' | 'bm' | 'visit' | 'waiting' | 'score' | 'understood';

export default function NPSDashboard({ branches = [], allowedBranches = [] }: NPSDashboardProps) {
  const branchOptions = allowedBranches.length > 0 ? allowedBranches : branches;

  const [tab, setTab] = useState<'tracker' | 'overview'>('tracker');
  const [stores, setStores] = useState<string[]>([]);
  const [bms, setBms] = useState<string[]>([]);
  const [preset, setPreset] = useState('last30');
  const [from, setFrom] = useState(presetRange('last30').from);
  const [to, setTo] = useState(presetRange('last30').to);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [understood, setUnderstood] = useState<Understood>('all');
  const [category, setCategory] = useState<CatFilter>('all');

  const [subTab, setSubTab] = useState<'pending' | 'completed'>('pending');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'visit', dir: 'desc' });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [rows, setRows] = useState<NPSRow[]>([]);
  const [prevRows, setPrevRows] = useState<NPSRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<NPSRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveBranches = stores.length > 0
    ? stores
    : (allowedBranches.length > 0 ? allowedBranches : undefined);
  const branchKey = (effectiveBranches ?? []).join(',');

  // The window immediately preceding the selected range, of equal length.
  const rangeLen = Math.max(1, daysBetweenISO(from, to) + 1);
  const prevTo = addDaysISO(from, -1);
  const prevFrom = addDaysISO(prevTo, -(rangeLen - 1));

  // Fetch the full row set for the range once per branch/date change; slice /
  // aggregate everything else (search, BM, understood, category, charts) in the client.
  const loadRows = useCallback(() => {
    setLoading(true);
    fetchNPSTracker({ branches: branchKey ? branchKey.split(',') : undefined, from, to })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [branchKey, from, to]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Prior-period rows power the KPI deltas; only needed on the Overview tab.
  useEffect(() => {
    if (tab !== 'overview') return;
    let cancelled = false;
    fetchNPSTracker({ branches: branchKey ? branchKey.split(',') : undefined, from: prevFrom, to: prevTo })
      .then(d => { if (!cancelled) setPrevRows(d); })
      .catch(() => { if (!cancelled) setPrevRows([]); });
    return () => { cancelled = true; };
  }, [tab, branchKey, prevFrom, prevTo]);

  useEffect(() => { setPage(1); }, [subTab, debouncedSearch, understood, category, branchKey, from, to, bms.join(',')]);

  const handleSubmit = async (payload: { footfall_id: number; score: number | null; understood: boolean | null; better: string[]; remark: string }) => {
    await submitNPS(payload);
    setActive(null);
    loadRows();
  };

  const applyDate = (f: string, t: string, p: string) => { setFrom(f); setTo(t); setPreset(p); };
  const clearFilters = () => {
    setStores([]); setBms([]); setSearch(''); setUnderstood('all'); setCategory('all');
    applyDate(presetRange('last30').from, presetRange('last30').to, 'last30');
  };

  // ── derived data ──────────────────────────────────────────────────────────
  const bmOptions = useMemo(() => Array.from(new Set(rows.map(r => r.bm).filter(Boolean))).sort() as string[], [rows]);

  const base = useMemo(() => rows.filter(r => okSearch(r, debouncedSearch) && okBm(r, bms)), [rows, debouncedSearch, bms]);
  const analysis = useMemo(() => base.filter(r => okUnderstood(r, understood) && okCategory(r, category)), [base, understood, category]);

  const cur = useMemo(() => computeMetrics(base, understood, category), [base, understood, category]);
  const prev = useMemo(() => {
    const pb = prevRows.filter(r => okSearch(r, debouncedSearch) && okBm(r, bms));
    return computeMetrics(pb, understood, category);
  }, [prevRows, debouncedSearch, bms, understood, category]);

  const trend = useMemo(() => {
    const map: Record<string, NPSRow[]> = {};
    let guard = 0;
    for (let d = from; d <= to && guard < 400; d = addDaysISO(d, 1), guard++) map[d] = [];
    // Deduplicate before bucketing, so a repeat visitor lands on one day only.
    uniqueReviews(analysis).forEach(r => { if (map[r.visit_date]) map[r.visit_date].push(r); });
    return Object.keys(map).sort().map(d => ({ date: d.slice(5), nps: npsOf(map[d]), responses: map[d].length }));
  }, [analysis, from, to]);
  const trendHasData = trend.some(p => p.nps != null);

  const storeData = useMemo(() => {
    const names = Array.from(new Set(analysis.map(r => r.store).filter(Boolean))) as string[];
    return names.map(s => {
      const rs = analysis.filter(r => r.store === s);
      const comp = uniqueReviews(rs);
      return {
        store: s,
        nps: npsOf(rs),
        count: comp.length,
        promoter: comp.filter(r => catOf(r.score!) === 'promoter').length,
        passive: comp.filter(r => catOf(r.score!) === 'passive').length,
        detractor: comp.filter(r => catOf(r.score!) === 'detractor').length,
      };
    }).filter(d => d.count > 0);
  }, [analysis]);

  const storeNpsData = useMemo(
    () => storeData.map(d => ({ store: d.store, nps: d.nps ?? 0, count: d.count })).sort((a, b) => b.nps - a.nps),
    [storeData],
  );
  const mixData = useMemo(
    () => storeData.slice().sort((a, b) => {
      const at = a.promoter + a.passive + a.detractor, bt = b.promoter + b.passive + b.detractor;
      return (b.promoter - b.detractor) / (bt || 1) - (a.promoter - a.detractor) / (at || 1);
    }),
    [storeData],
  );

  // Conversion is unique footfall vs unique reviews, over every footfall in `base`
  // (pending + submitted), so it deliberately ignores the understood/category chips.
  const storeResponseData = useMemo(() => {
    const names = Array.from(new Set(base.map(r => r.store).filter(Boolean))) as string[];
    return names.map(s => {
      const rs = base.filter(r => r.store === s);
      const footfalls = uniqueCustomers(rs).length;
      const responses = uniqueReviews(rs).length;
      return {
        store: s,
        footfalls,
        responses,
        pending: footfalls - responses,
        rate: footfalls ? Math.round(responses / footfalls * 100) : 0,
      };
    }).sort((a, b) => b.rate - a.rate || b.footfalls - a.footfalls);
  }, [base]);

  // Totalled over `base`, not summed across stores: one customer can visit two.
  const responseTotals = useMemo(() => {
    const footfalls = uniqueCustomers(base).length;
    const responses = uniqueReviews(base).length;
    return { footfalls, responses, pending: footfalls - responses, rate: footfalls ? Math.round(responses / footfalls * 100) : 0 };
  }, [base]);

  const bmChartData = useMemo(() => {
    const names = Array.from(new Set(analysis.map(r => r.bm).filter(Boolean))) as string[];
    return names.map(n => {
      const rs = analysis.filter(r => r.bm === n);
      return { bm: n, nps: npsOf(rs) ?? 0, count: uniqueReviews(rs).length };
    }).filter(d => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 10).sort((a, b) => b.nps - a.nps);
  }, [analysis]);

  const dist = useMemo(() => {
    const comp = uniqueReviews(analysis);
    return Array.from({ length: 11 }, (_, s) => ({ score: s, count: comp.filter(r => r.score === s).length }));
  }, [analysis]);
  const distHasData = dist.some(d => d.count > 0);

  const reasonData = useMemo(() => {
    const noRows = uniqueCustomers(analysis.filter(r => r.status === 'submitted' && r.understood === false));
    const counts: Record<string, number> = {};
    Q3_OPTIONS.forEach(o => { counts[o] = 0; });
    noRows.forEach(r => (r.better || []).forEach(b => { if (b in counts) counts[b]++; }));
    const data = Q3_OPTIONS.map(o => ({ reason: o, value: counts[o] })).sort((a, b) => b.value - a.value);
    return { data, hasData: noRows.length > 0, max: Math.max(1, ...data.map(d => d.value)) };
  }, [analysis]);

  // ── tracker rows ────────────────────────────────────────────────────────────
  // One row per customer on both lists, so customers - reviews = pending holds.
  const pendingRows = useMemo(() => uniqueCustomers(base.filter(r => r.status === 'pending')), [base]);
  const completedRows = useMemo(() => uniqueReviews(analysis), [analysis]);

  const sortedRows = useMemo(() => {
    const list = (subTab === 'pending' ? pendingRows : completedRows).slice();
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r: NPSRow): string | number => {
      switch (sort.key) {
        case 'name': return (r.name || '').toLowerCase();
        case 'contact': return r.contact ?? 0;
        case 'store': return (r.store || '').toLowerCase();
        case 'bm': return (r.bm || '').toLowerCase();
        case 'waiting': return daysSince(r.visit_date);
        case 'score': return r.score ?? -1;
        case 'understood': return r.understood == null ? -1 : (r.understood ? 1 : 0);
        case 'visit':
        default: return `${r.visit_date} ${r.time}`;
      }
    };
    return list.sort((a, b) => { const av = val(a), bv = val(b); return av < bv ? -1 * dir : av > bv ? 1 * dir : 0; });
  }, [subTab, pendingRows, completedRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'visit' || key === 'waiting' || key === 'score' ? 'desc' : 'asc' });

  const SortHead = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-5 py-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort(k)}>
      {label}{sort.key === k && <span className="ml-1 text-blue-500">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );

  const exportLabel = tab === 'overview' ? 'Export CSV' : subTab === 'pending' ? 'Export Pending CSV' : 'Export Completed CSV';
  const doExport = () => {
    if (tab === 'tracker' && subTab === 'pending') {
      exportCSV(
        `nps-pending-${from}_to_${to}.csv`,
        ['Name', 'Phone', 'Store', 'BM', 'Visit Date', 'Time', 'Days Waiting'],
        sortedRows.map(r => [r.name || '', fmtPhone(r.contact), r.store || '', r.bm || '', r.visit_date, r.time, daysSince(r.visit_date)]),
      );
    } else {
      const src = tab === 'overview' ? completedRows.slice().sort((a, b) => `${b.visit_date} ${b.time}`.localeCompare(`${a.visit_date} ${a.time}`)) : sortedRows;
      exportCSV(
        `nps-completed-${from}_to_${to}.csv`,
        ['Name', 'Phone', 'Store', 'BM', 'Visit Date', 'Time', 'Score', 'Bucket', 'Understood', 'Reasons', 'Comment'],
        src.map(r => [r.name || '', fmtPhone(r.contact), r.store || '', r.bm || '', r.visit_date, r.time, r.score ?? '', r.score != null ? bucketOf(r.score) : '', r.understood ? 'Yes' : 'No', (r.better || []).join(' / '), r.remark || '']),
      );
    }
  };

  // summaries
  const staleCount = pendingRows.filter(r => daysSince(r.visit_date) >= 3).length;
  const avgWait = pendingRows.length ? (pendingRows.reduce((a, r) => a + daysSince(r.visit_date), 0) / pendingRows.length).toFixed(1) : '—';
  const compNps = npsOf(completedRows);
  const compAvg = completedRows.length ? (completedRows.reduce((a, r) => a + r.score!, 0) / completedRows.length).toFixed(1) : '—';

  const storeLabel = stores.length === 0 ? 'All Stores' : stores.length === 1 ? stores[0] : `${stores.length} stores`;
  const chartHeight = Math.max(160, storeNpsData.length * 42 + 20);

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6 max-w-[1400px] mx-auto">
      {/* heading */}
      <h1 className="text-[22px] font-bold text-gray-900">NPS Dashboard</h1>
      <p className="text-[13px] text-gray-400 mt-0.5">Net Promoter Score · {storeLabel} · {fmtDate(from)} – {fmtDate(to)}</p>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <MultiDropdown label="All Stores" dot="#3B82F6" accent="#3B82F6" options={branchOptions} selected={stores} onChange={setStores} />
        <MultiDropdown label="All BMs" dot={C.bm} accent={C.bm} options={bmOptions} selected={bms} onChange={setBms} searchable />
        <DateDropdown from={from} to={to} preset={preset} onApply={applyDate} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone..."
          className="border border-gray-300 rounded-full px-4 h-9 text-[13px] text-gray-700 outline-none focus:border-gray-400 w-[220px]"
        />
        <Segmented value={understood} onChange={setUnderstood} options={[{ val: 'all', label: 'Understood: All' }, { val: 'yes', label: 'Yes' }, { val: 'no', label: 'No' }]} />
        <Segmented value={category} onChange={setCategory} options={[{ val: 'all', label: 'All scores' }, { val: 'promoter', label: 'Promoters' }, { val: 'passive', label: 'Passives' }, { val: 'detractor', label: 'Detractors' }]} />
      </div>

      <div className="flex items-center justify-between mt-3">
        <button onClick={clearFilters} className="text-[13px] font-semibold text-gray-600 hover:text-gray-900 underline cursor-pointer">Clear filters</button>
        <button onClick={doExport} className="px-4 h-9 rounded-full text-[13px] font-bold text-white bg-gray-900 hover:bg-black cursor-pointer">{exportLabel}</button>
      </div>

      {/* sub-tabs */}
      <div className="flex items-center gap-6 mt-5 border-b border-gray-200">
        {([['tracker', 'Tracker'], ['overview', 'Overview']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`pb-2.5 text-[14px] font-semibold border-b-2 cursor-pointer transition-colors ${tab === k ? 'border-[#EAB308] text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tracker ── */}
      {tab === 'tracker' && (
        <div className="mt-5">
          {/* subtabs */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {([['pending', 'Did not fill NPS', pendingRows.length], ['completed', 'NPS Collected', completedRows.length]] as const).map(([k, label, count]) => (
              <button
                key={k}
                onClick={() => { setSubTab(k); setSort({ key: 'visit', dir: 'desc' }); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13.5px] font-semibold border cursor-pointer transition-colors ${subTab === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
              >
                {label}
                <span className={`text-[11.5px] font-bold px-2 py-0.5 rounded-full ${subTab === k ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{count}</span>
              </button>
            ))}
          </div>

          {/* summary */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4 text-[13.5px] text-gray-500">
            {subTab === 'pending' ? (
              <>
                <span><b className="text-gray-900 font-bold">{pendingRows.length}</b> customers have not filled the NPS survey yet</span>
                <span>Stale (3+ days) <b className={`font-bold ${staleCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{staleCount}</b></span>
                <span>Avg wait <b className="text-gray-900 font-bold">{avgWait === '—' ? '—' : `${avgWait}d`}</b></span>
              </>
            ) : (
              <>
                <span><b className="text-gray-900 font-bold">{completedRows.length}</b> responses match filters</span>
                <span>NPS <b className={`font-bold ${compNps == null ? 'text-gray-900' : compNps >= 0 ? 'text-green-600' : 'text-red-600'}`}>{compNps == null ? '—' : fmtSigned(compNps)}</b></span>
                <span>Avg score <b className="text-gray-900 font-bold">{compAvg}</b></span>
                <span>Response rate <b className="text-gray-900 font-bold">{cur.responseRate == null ? '—' : `${cur.responseRate}%`}</b></span>
              </>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <SortHead label="Name" k="name" />
                  <SortHead label="Phone" k="contact" />
                  <SortHead label="Store" k="store" />
                  <SortHead label="BM" k="bm" />
                  <SortHead label="Visit Date" k="visit" />
                  {subTab === 'pending' ? (
                    <SortHead label="Waiting" k="waiting" />
                  ) : (
                    <>
                      <SortHead label="Result" k="score" />
                      <SortHead label="Understood" k="understood" />
                      <th className="px-5 py-3">Reasons</th>
                      <th className="px-5 py-3">Comment</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.id} onClick={() => setActive(r)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-5 py-3.5 text-[14px] font-semibold text-gray-900">{r.name || '—'}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600">{fmtPhone(r.contact)}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600">{r.store || '—'}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600">{r.bm || '—'}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600 whitespace-nowrap">{fmtDate(r.visit_date)} <span className="text-gray-400">· {r.time}</span></td>
                    {subTab === 'pending' ? (
                      <td className="px-5 py-3.5"><WaitChip visitDate={r.visit_date} /></td>
                    ) : (
                      <>
                        <td className="px-5 py-3.5"><ResultPill score={r.score} /></td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold ${r.understood ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{r.understood ? 'Yes' : 'No'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {r.better && r.better.length ? (
                            <div className="flex flex-wrap gap-1 max-w-[240px]">
                              {r.better.map(b => <span key={b} className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{b}</span>)}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-gray-600 max-w-[220px] truncate" title={r.remark || ''}>{r.remark || <span className="text-gray-300">—</span>}</td>
                      </>
                    )}
                  </tr>
                ))}
                {!loading && sortedRows.length === 0 && (
                  <tr><td colSpan={subTab === 'pending' ? 6 : 9} className="px-5 py-10 text-center text-[13px] text-gray-400">No {subTab === 'pending' ? 'pending visits' : 'responses'} for this filter.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan={subTab === 'pending' ? 6 : 9} className="px-5 py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
                )}
              </tbody>
            </table>
            </div>
            {sortedRows.length > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-[13px] text-gray-500">
                <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="mt-5 space-y-5">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiTile label="NPS Score" accent={C.line}
              value={cur.nps == null ? '—' : fmtSigned(cur.nps)}
              valueClass={cur.nps == null ? '' : cur.nps >= 0 ? 'text-green-600' : 'text-red-600'}
              delta={<Delta cur={cur.nps} prev={prev.nps} unit=" pts" dir={1} />} />
            <KpiTile label="Avg Score" accent={C.bm}
              value={cur.avg == null ? '—' : cur.avg.toFixed(1)}
              delta={<Delta cur={cur.avg} prev={prev.avg} dec={1} dir={1} />} />
            <KpiTile label="Total Responses" accent="#14B8A6"
              value={String(cur.total)}
              delta={<Delta cur={cur.total} prev={prev.total} dir={1} />} />
            <KpiTile label="Conversion %" accent={C.passive}
              value={cur.responseRate == null ? '—' : `${cur.responseRate}%`}
              delta={<Delta cur={cur.responseRate} prev={prev.responseRate} unit=" pp" dir={1} />} />
            <KpiTile label="Promoters" accent={C.promoter}
              value={cur.promoterPct == null ? '—' : `${cur.promoterPct}%`}
              valueClass="text-green-600"
              delta={<Delta cur={cur.promoterPct} prev={prev.promoterPct} unit=" pp" dir={1} />} />
            <KpiTile label="Detractors" accent={C.detractor}
              value={cur.detractorPct == null ? '—' : `${cur.detractorPct}%`}
              valueClass="text-red-600"
              delta={<Delta cur={cur.detractorPct} prev={prev.detractorPct} unit=" pp" dir={-1} />} />
          </div>

          {/* Daily trend */}
          <ChartCard title="Daily NPS trend" caption="Net Promoter Score by day, for the selected filters">
            {trendHasData ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                  <ReferenceLine y={0} stroke="#D1D5DB" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    formatter={(v: unknown, n: unknown) => [n === 'nps' ? (v == null ? 'no data' : fmtSigned(Number(v))) : v as number, n === 'nps' ? 'NPS' : 'Responses']} />
                  <Line type="monotone" dataKey="nps" stroke={C.line} strokeWidth={2} dot={{ r: 2.5, fill: C.line }} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart msg="No completed responses in this range." />}
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* NPS by store */}
            <ChartCard title="NPS by store" caption="Sorted highest to lowest">
              {storeNpsData.length ? (
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart data={storeNpsData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis type="number" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="store" width={90} tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} />
                    <ReferenceLine x={0} stroke="#D1D5DB" />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                      formatter={(v: unknown) => [fmtSigned(Number(v)), 'NPS']} />
                    <Bar dataKey="nps" radius={[3, 3, 3, 3]} barSize={18} isAnimationActive={false}>
                      {storeNpsData.map((d, i) => <Cell key={i} fill={d.nps >= 0 ? C.promoter : C.detractor} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart msg="No data for this selection." />}
            </ChartCard>

            {/* NPS by BM */}
            <ChartCard title="NPS by BM (salesperson)" caption="Top 10 by response volume">
              {bmChartData.length ? (
                <ResponsiveContainer width="100%" height={Math.max(160, bmChartData.length * 42 + 20)}>
                  <BarChart data={bmChartData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis type="number" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="bm" width={90} tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} />
                    <ReferenceLine x={0} stroke="#D1D5DB" />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                      formatter={(v: unknown) => [fmtSigned(Number(v)), 'NPS']} />
                    <Bar dataKey="nps" radius={[3, 3, 3, 3]} barSize={18} isAnimationActive={false}>
                      {bmChartData.map((d, i) => <Cell key={i} fill={d.nps >= 0 ? C.promoter : C.detractor} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart msg="No data for this selection." />}
            </ChartCard>
          </div>

          {/* Response rate by store */}
          <ChartCard title="Conversion by store" caption="Unique customers who reviewed vs unique footfall · sorted highest to lowest">
            {storeResponseData.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="px-4 py-2.5">Store</th>
                      <th className="px-4 py-2.5 text-right">Customers</th>
                      <th className="px-4 py-2.5 text-right">Reviews</th>
                      <th className="px-4 py-2.5 text-right">Pending</th>
                      <th className="px-4 py-2.5 text-right">Conversion %</th>
                      <th className="px-4 py-2.5 w-[180px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeResponseData.map(d => (
                      <tr key={d.store} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 text-[13.5px] font-semibold text-gray-900">{d.store}</td>
                        <td className="px-4 py-3 text-[13.5px] text-gray-600 text-right tabular-nums">{d.footfalls}</td>
                        <td className="px-4 py-3 text-[13.5px] text-gray-900 font-semibold text-right tabular-nums">{d.responses}</td>
                        <td className="px-4 py-3 text-[13.5px] text-gray-500 text-right tabular-nums">{d.pending}</td>
                        <td className={`px-4 py-3 text-[13.5px] font-bold text-right tabular-nums ${d.rate >= 70 ? 'text-green-600' : d.rate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{d.rate}%</td>
                        <td className="px-4 py-3">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${d.rate}%`, background: d.rate >= 70 ? C.promoter : d.rate >= 40 ? C.passive : C.detractor }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/60">
                      <td className="px-4 py-3 text-[13.5px] font-bold text-gray-900">Total</td>
                      <td className="px-4 py-3 text-[13.5px] font-semibold text-gray-700 text-right tabular-nums">{responseTotals.footfalls}</td>
                      <td className="px-4 py-3 text-[13.5px] font-bold text-gray-900 text-right tabular-nums">{responseTotals.responses}</td>
                      <td className="px-4 py-3 text-[13.5px] font-semibold text-gray-600 text-right tabular-nums">{responseTotals.pending}</td>
                      <td className="px-4 py-3 text-[13.5px] font-bold text-gray-900 text-right tabular-nums">{responseTotals.rate}%</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : <EmptyChart msg="No footfalls in this selection." />}
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Score distribution */}
            <ChartCard title="Score distribution" caption="Count of responses per 0–10 rating">
              {distHasData ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dist} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="score" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                      formatter={(v: unknown) => [v as number, 'Responses']} labelFormatter={(l: unknown) => `Score ${l}`} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {dist.map((d, i) => <Cell key={i} fill={d.score >= 9 ? C.promoter : d.score >= 7 ? C.passive : C.detractor} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart msg="No completed responses in this selection." />}
              <div className="flex gap-4 mt-3 text-[12px] text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.promoter }} />Promoter (9–10)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.passive }} />Passive (7–8)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.detractor }} />Detractor (0–6)</span>
              </div>
            </ChartCard>

            {/* Reason breakdown */}
            <ChartCard title="Why we didn't understand the requirement" caption="Among responses where Q2 = No">
              {reasonData.hasData ? (
                <div className="space-y-3 pt-1">
                  {reasonData.data.map(d => (
                    <div key={d.reason} className="flex items-center gap-3">
                      <div className="w-[180px] shrink-0 text-[12.5px] text-gray-700 font-medium text-right">{d.reason}</div>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(d.value / reasonData.max) * 100}%`, background: C.line }} />
                      </div>
                      <div className="w-8 text-[13px] font-semibold text-gray-700 tabular-nums text-right">{d.value}</div>
                    </div>
                  ))}
                </div>
              ) : <EmptyChart msg={'No "No" responses in this selection.'} />}
            </ChartCard>
          </div>

          {/* Response mix by store */}
          <ChartCard title="Response mix by store" caption="Share of promoters, passives and detractors per store · sorted by net sentiment">
            {mixData.length ? (
              <>
                <div className="space-y-3 pt-1">
                  {mixData.map(d => {
                    const total = d.promoter + d.passive + d.detractor;
                    const seg = (n: number) => (total ? (n / total) * 100 : 0);
                    const cells: { v: number; bg: string; tx: string }[] = [
                      { v: seg(d.promoter), bg: C.promoter, tx: '#fff' },
                      { v: seg(d.passive), bg: C.passive, tx: '#3a2c00' },
                      { v: seg(d.detractor), bg: C.detractor, tx: '#fff' },
                    ];
                    return (
                      <div key={d.store} className="flex items-center gap-3">
                        <div className="w-[90px] shrink-0 text-[12.5px] text-gray-700 font-semibold text-right">{d.store}</div>
                        <div className="flex-1 h-7 rounded-md overflow-hidden flex">
                          {cells.map((c, i) => c.v > 0 && (
                            <div key={i} className="h-full flex items-center justify-center text-[11px] font-bold" style={{ width: `${c.v}%`, background: c.bg, color: c.tx }}>
                              {c.v >= 12 ? `${Math.round(c.v)}%` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-4 text-[12px] text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.promoter }} />Promoter</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.passive }} />Passive</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.detractor }} />Detractor</span>
                </div>
              </>
            ) : <EmptyChart msg="No completed responses in this selection." />}
          </ChartCard>
        </div>
      )}

      {active && (
        <SurveyModal
          row={active}
          onClose={() => setActive(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

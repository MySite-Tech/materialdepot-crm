'use client';

import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ── Types ───────────────────────────────────────────────────────────────────
type NpsStatus = 'submitted' | 'pending';
interface NpsRow {
  id: string;
  name: string;
  contact: string;
  store: string;
  visitDate: string; // ISO yyyy-mm-dd
  time: string;
  status: NpsStatus;
  score: number | null;       // Q1: 0-10
  understood: boolean | null;  // Q2: Yes/No
  remark: string;              // Q4
}

// ── NPS helpers ───────────────────────────────────────────────────────────────
type Bucket = 'Promoter' | 'Passive' | 'Detractor';
const bucketOf = (score: number): Bucket =>
  score >= 9 ? 'Promoter' : score >= 7 ? 'Passive' : 'Detractor';

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

const npsScore = (rows: NpsRow[]): number | null => {
  const scored = rows.filter(r => r.score != null) as (NpsRow & { score: number })[];
  if (!scored.length) return null;
  const promoters = scored.filter(r => r.score >= 9).length;
  const detractors = scored.filter(r => r.score <= 6).length;
  return Math.round(((promoters - detractors) / scored.length) * 100);
};

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// ── Mock data (frontend only — backend wires in later) ───────────────────────
const MOCK_ROWS: NpsRow[] = [
  { id: '1', name: 'Rachna Sharma', contact: '+91 9876543210', store: 'JP Nagar', visitDate: '2026-06-25', time: '10:15', status: 'submitted', score: 9, understood: true, remark: 'Very helpful staff.' },
  { id: '2', name: 'Arjun Mehta', contact: '+91 9845001234', store: 'JP Nagar', visitDate: '2026-06-25', time: '11:30', status: 'submitted', score: 9, understood: true, remark: 'Good range of tiles.' },
  { id: '3', name: 'Priya Nair', contact: '+91 9900112233', store: 'JP Nagar', visitDate: '2026-06-25', time: '14:00', status: 'submitted', score: 4, understood: false, remark: 'Long wait time.' },
  { id: '4', name: 'Karan Patel', contact: '+91 9812345678', store: 'Whitefield', visitDate: '2026-06-25', time: '09:45', status: 'submitted', score: 10, understood: true, remark: 'Excellent experience.' },
  { id: '5', name: 'Sunita Rao', contact: '+91 9988776655', store: 'Whitefield', visitDate: '2026-06-25', time: '13:20', status: 'pending', score: null, understood: null, remark: '' },
  { id: '6', name: 'Vikram Joshi', contact: '+91 9771234567', store: 'Gachibowli', visitDate: '2026-06-25', time: '10:50', status: 'submitted', score: 8, understood: true, remark: 'Decent, could be faster.' },
  { id: '7', name: 'Ananya Krishnan', contact: '+91 9654321098', store: 'Gachibowli', visitDate: '2026-06-25', time: '15:05', status: 'pending', score: null, understood: null, remark: '' },
  { id: '8', name: 'Suresh Kumar', contact: '+91 9811223344', store: 'Yelahanka', visitDate: '2026-06-25', time: '11:10', status: 'submitted', score: 9, understood: true, remark: 'Will recommend.' },
  { id: '9', name: 'Lakshmi Devi', contact: '+91 9722334455', store: 'Yelahanka', visitDate: '2026-06-25', time: '14:45', status: 'submitted', score: 10, understood: true, remark: 'Loved the collection.' },
  { id: '10', name: 'Deepak Verma', contact: '+91 9501234567', store: 'JP Nagar', visitDate: '2026-06-05', time: '11:00', status: 'submitted', score: 9, understood: true, remark: '' },
  { id: '11', name: 'Amit Sharma', contact: '+91 9633445566', store: 'JP Nagar', visitDate: '2026-06-24', time: '10:20', status: 'submitted', score: 9, understood: true, remark: '' },
  { id: '12', name: 'Pooja Singh', contact: '+91 9544556677', store: 'JP Nagar', visitDate: '2026-06-24', time: '12:05', status: 'submitted', score: 7, understood: true, remark: 'Average.' },
  { id: '13', name: 'Ramesh Kumar', contact: '+91 9455667788', store: 'JP Nagar', visitDate: '2026-06-24', time: '15:30', status: 'submitted', score: 2, understood: false, remark: 'Not satisfied.' },
  { id: '14', name: 'Kavitha Reddy', contact: '+91 9366778899', store: 'JP Nagar', visitDate: '2026-06-24', time: '16:00', status: 'pending', score: null, understood: null, remark: '' },
];

// Daily NPS series for the Overview chart.
const DAILY_NPS = [
  { date: '01/06', nps: 100 }, { date: '05/06', nps: 50 }, { date: '07/06', nps: 100 },
  { date: '09/06', nps: 100 }, { date: '11/06', nps: 0 }, { date: '12/06', nps: -100 },
  { date: '14/06', nps: 100 }, { date: '16/06', nps: 100 }, { date: '18/06', nps: -100 },
  { date: '19/06', nps: 100 }, { date: '20/06', nps: 100 }, { date: '21/06', nps: 0 },
  { date: '22/06', nps: 100 }, { date: '23/06', nps: 50 }, { date: '24/06', nps: 44 },
  { date: '25/06', nps: 57 },
];

// ── Small UI atoms ────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: NpsStatus }) {
  const submitted = status === 'submitted';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${submitted ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${submitted ? 'bg-green-500' : 'bg-amber-500'}`} />
      {submitted ? 'Submitted' : 'Pending'}
    </span>
  );
}

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

interface StatCardProps { label: string; value: number | null; responses: number; trailing?: React.ReactNode }
function StatCard({ label, value, responses, trailing }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        {trailing}
      </div>
      <div className="text-[32px] leading-none font-bold text-gray-900 mt-3">
        {value == null ? '—' : `${value > 0 ? '+' : ''}${value}`}
      </div>
      <div className="text-[12px] text-gray-400 mt-2">{responses} responses</div>
    </div>
  );
}

// ── Store dropdown ──────────────────────────────────────────────────────────
function StoreDropdown({ stores, value, onChange }: { stores: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-white text-gray-700 border border-gray-300 hover:border-gray-400 cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
        {value}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] py-1 min-w-[160px]">
            {['All Stores', ...stores].map(s => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-gray-50 cursor-pointer ${s === value ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Survey modal ──────────────────────────────────────────────────────────────
function SurveyModal({ row, onClose, onSave }: { row: NpsRow; onClose: () => void; onSave: (r: NpsRow) => void }) {
  const [score, setScore] = useState<number | null>(row.score);
  const [understood, setUnderstood] = useState<boolean | null>(row.understood);
  const [remark, setRemark] = useState(row.remark);

  const bucket = score == null ? null : bucketOf(score);

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/40 py-10 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] my-auto">
        {/* header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <h2 className="text-[18px] font-bold text-gray-900">NPS Survey</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">Collect feedback from the customer.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
        </div>

        {/* visitor info */}
        <div className="px-6 grid grid-cols-2 gap-y-3 gap-x-6 pb-5">
          {[['Name', row.name], ['Phone', row.contact], ['Store', row.store], ['Visit Date', fmtDate(row.visitDate)]].map(([k, v]) => (
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
                onClick={() => setUnderstood(true)}
                className={`px-7 py-2.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${understood === true ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >Yes</button>
              <button
                onClick={() => setUnderstood(false)}
                className={`px-7 py-2.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${understood === false ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >No</button>
            </div>
          </div>

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

        {/* footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mr-auto">
            <ResultPill score={score} />
            {row.status === 'submitted' && <span className="text-[13px] text-gray-400">Submitted — you can correct it.</span>}
          </div>
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-[14px] font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 cursor-pointer">Cancel</button>
          <button
            onClick={() => onSave({ ...row, score, understood, remark, status: score != null ? 'submitted' : 'pending' })}
            className="px-6 py-2 rounded-lg text-[14px] font-semibold text-white bg-gray-900 hover:bg-black cursor-pointer"
          >Update</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface NPSDashboardProps {
  branches?: string[];
  allowedBranches?: string[];
}

export default function NPSDashboard({ branches = [] }: NPSDashboardProps) {
  const [rows, setRows] = useState<NpsRow[]>(MOCK_ROWS);
  const [tab, setTab] = useState<'tracker' | 'overview'>('tracker');
  const [store, setStore] = useState('All Stores');
  const [from, setFrom] = useState('2026-06-01');
  const [to, setTo] = useState('2026-06-25');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<NpsRow | null>(null);

  const storeOptions = branches.length ? branches : Array.from(new Set(MOCK_ROWS.map(r => r.store)));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (store !== 'All Stores' && r.store !== store) return false;
      if (from && r.visitDate < from) return false;
      if (to && r.visitDate > to) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.contact.includes(q)) return false;
      return true;
    });
  }, [rows, store, from, to, search]);

  const overall = npsScore(filtered);
  const submittedCount = filtered.filter(r => r.status === 'submitted').length;

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6 max-w-[1400px] mx-auto">
      {/* heading */}
      <h1 className="text-[22px] font-bold text-gray-900">NPS Tracker</h1>
      <p className="text-[13px] text-gray-400 mt-0.5">Net Promoter Score, {store}</p>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <StoreDropdown stores={storeOptions} value={store} onChange={setStore} />
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-gray-400">From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 bg-white text-gray-700 rounded-lg px-2.5 py-1.5 text-[13px] outline-none" />
          <span className="text-[13px] text-gray-400">To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-[#EAB308] bg-[#FFFBEB] text-gray-800 rounded-lg px-2.5 py-1.5 text-[13px] outline-none font-medium" />
        </div>
      </div>

      {/* sub-tabs */}
      <div className="flex items-center gap-6 mt-6 border-b border-gray-200">
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
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or phone..."
            className="w-full max-w-[320px] border border-gray-200 rounded-full px-4 py-2 text-[13px] text-gray-700 outline-none focus:border-gray-400 mb-4"
          />
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Store</th>
                  <th className="px-5 py-3">Visit Date</th>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} onClick={() => setActive(r)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-5 py-3.5 text-[14px] font-semibold text-gray-900">{r.name}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600">{r.contact}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600">{r.store}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-600">{fmtDate(r.visitDate)}</td>
                    <td className="px-5 py-3.5 text-[14px] text-gray-500">{r.time}</td>
                    <td className="px-5 py-3.5"><StatusPill status={r.status} /></td>
                    <td className="px-5 py-3.5"><ResultPill score={r.score} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-gray-400">No responses for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Today" value={overall} responses={submittedCount} />
            <StatCard label="Yesterday" value={43} responses={7} />
            <StatCard label="Day Before" value={50} responses={8} />
            <StatCard label="1 Month" value={51} responses={37}
              trailing={<span className="text-[11px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">1 mo ▾</span>} />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-bold text-gray-900">Daily NPS</h3>
              <span className="text-[12px] text-gray-400">NPS trending down this period (recent avg +44).</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={DAILY_NPS} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <ReferenceLine y={0} stroke="#E5E7EB" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
                <Line type="monotone" dataKey="nps" stroke="#6B7FA8" strokeWidth={2} dot={{ r: 3, fill: '#6B7FA8' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {active && (
        <SurveyModal
          row={active}
          onClose={() => setActive(null)}
          onSave={(updated) => { setRows(rs => rs.map(r => r.id === updated.id ? updated : r)); setActive(null); }}
        />
      )}
    </div>
  );
}

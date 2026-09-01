'use client';

/* Category Ops → 📊 NPS analytics.

   The COE takes Q1/Q2/Q3 on every client after a site audit and after every
   installation, and ⭐ Review scores already shows the resulting NPS — but only
   as three fixed periods (30 / 90 / all) with no trend, no per-person view and
   no way to answer "how did last month compare". This tab is that: the same
   numbers over a SELECTED DATE RANGE, laid out like the store-visit NPS
   dashboard the CRM already has (`components/nps/NPSDashboard.tsx`), which is
   the shape the business already reads (requested 2026-09-01).

   THREE THINGS THIS TAB DOES NOT DO, EACH FOR A REASON WRITTEN DOWN ELSEWHERE:

   1. It does not use textbook NPS bands. Field-service NPS runs on Material
      Depot's stricter house bands (promoter 9–10, neutral 8, detractor ≤7) via
      `npsFrom`/`npsBand` — ONE definition shared with Analytics and Review
      scores. The store-visit dashboard this borrows its layout from uses
      textbook bands on a different population; the two numbers are never
      averaged and this page prints its own bands on screen so a reader can't
      mistake which is on it. See CLAUDE.md, "Two different NPS numbers".
   2. It does not read the `ratings` table. Everything comes from the CALL LOGS
      (`scoredCalls`), the source of truth — `ratings` is a projection that can
      and has fallen behind it. That is also why this tab and ⭐ Review scores
      can never disagree: same function, same rows.
   3. It does not date-filter on `ratings.created_at`, because it isn't reading
      that table. A scored call is placed on the day the COE MADE it, which is
      the only date this data has and the one the COE is measured on.

   Expect the last day or two of any range to look thin: a D+1 call for a job
   finished yesterday hasn't happened yet. That is stated on the page rather
   than smoothed over. */

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, CartesianGrid, Cell, LineChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  NPS_BAND_LABELS, NPS_HOUSE_NOTE, avgScore, fmtDate, npsBand, npsFrom, type NpsSummary,
} from '../siteAuditShared';
import {
  auditReviewProgress, followupRows, inDateRange, installReviewProgress, installReviewRows,
  presetRange, previousRange, scoredCalls,
  type CoeInstall, type CoeOrder, type DatePresetKey, type DateRange, type ReviewProgress, type ScoredCall,
} from './shared';
import { DateRangeFilter } from './filters';

const C = {
  promoter: '#22C55E',
  neutral: '#EAB308',
  detractor: '#EF4444',
  line: '#1F3A5F',
  grid: '#F0F0F0',
  axis: '#9CA3AF',
};

type Side = 'both' | 'audit' | 'install';
const SIDES: Array<{ k: Side; l: string }> = [
  { k: 'both', l: 'Audits + installs' },
  { k: 'audit', l: 'Site audits' },
  { k: 'install', l: 'Installations' },
];

const fmtSigned = (n: number) => (n > 0 ? '+' : '') + n;

/* ── Tiles ────────────────────────────────────────────────────────────────
   `null` is rendered as "—" everywhere, never as 0: a zero NPS is a real and
   bad result and must not be produced by an empty range. `npsFrom` already
   returns null for no scores; every tile here keeps that distinction. */
function Delta({ cur, prev, unit = '', dir = 1, dec = 0 }: { cur: number | null; prev: number | null; unit?: string; dir?: number; dec?: number }) {
  if (cur == null || prev == null) return <div className="mt-1.5 text-[11.5px] text-gray-400">no prior period</div>;
  const diff = cur - prev;
  const eps = dec ? 0.05 : 0.5;
  if (Math.abs(diff) < eps) return <div className="mt-1.5 text-[11.5px] text-gray-400">no change vs prev</div>;
  const good = diff > 0 ? dir > 0 : dir < 0;
  const mag = dec ? Math.abs(diff).toFixed(dec) : String(Math.round(Math.abs(diff)));
  return (
    <div className={`mt-1.5 flex items-center gap-1 text-[11.5px] font-medium ${good ? 'text-green-600' : 'text-red-600'}`}>
      {diff > 0 ? '▲' : '▼'} {mag}{unit}<span className="font-normal text-gray-400">vs prev</span>
    </div>
  );
}

function Tile({ label, value, accent, valueClass = '', sub, delta }: {
  label: string; value: string; accent: string; valueClass?: string; sub?: React.ReactNode; delta?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: accent }} />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-2 font-mono text-[26px] font-bold leading-none ${valueClass || 'text-gray-900'}`}>{value}</div>
      {sub ? <div className="mt-1 text-[11.5px] text-gray-400">{sub}</div> : null}
      {delta}
    </div>
  );
}

function Card({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-[13.5px] font-bold text-gray-900">{title}</h3>
      {caption ? <p className="mt-0.5 text-[11.5px] text-gray-400">{caption}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="py-10 text-center text-[12.5px] text-gray-400">{msg}</div>;
}

const BAND_PILL = {
  promoter: 'bg-green-50 text-green-700',
  neutral: 'bg-gray-100 text-gray-600',
  detractor: 'bg-red-50 text-red-700',
} as const;

/* ── Derivations ──────────────────────────────────────────────────────────── */

/* One point per DAY IN THE RANGE, including the days with no scores — those
   carry `nps: null` and the line breaks (`connectNulls={false}`) rather than
   drawing straight through them. A gap is "nobody was called", which is
   information; interpolating it invents scores. Capped so a multi-year custom
   range doesn't render 800 ticks: past the cap the trend switches to weeks. */
const TREND_DAY_CAP = 92;

type TrendPoint = { label: string; nps: number | null; n: number };

function buildTrend(scored: ScoredCall[], r: DateRange): { points: TrendPoint[]; unit: 'day' | 'week' } {
  if (!scored.length) return { points: [], unit: 'day' };
  const days = scored.map((s) => s.at.slice(0, 10));
  const from = r.from || days.reduce((a, b) => (a < b ? a : b));
  const to = r.to || days.reduce((a, b) => (a > b ? a : b));
  const span = Math.round((new Date(to + 'T00:00').getTime() - new Date(from + 'T00:00').getTime()) / 86400000) + 1;
  const unit: 'day' | 'week' = span > TREND_DAY_CAP ? 'week' : 'day';

  const buckets = new Map<string, number[]>();
  const keyOf = (day: string) => {
    if (unit === 'day') return day;
    // ISO-ish week key: Monday of that day's week, so a bucket label is a real date.
    const d = new Date(day + 'T00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  // Seed every bucket in the range so empty ones are visible as gaps.
  for (let d = from; d <= to;) {
    const k = keyOf(d);
    if (!buckets.has(k)) buckets.set(k, []);
    const nd = new Date(d + 'T00:00');
    nd.setDate(nd.getDate() + 1);
    d = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0') + '-' + String(nd.getDate()).padStart(2, '0');
  }
  for (const s of scored) {
    const k = keyOf(s.at.slice(0, 10));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(s.q1);
  }
  const points = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, scores]) => {
      const s = npsFrom(scores);
      const d = new Date(k + 'T00:00');
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return { label: unit === 'week' ? 'w/c ' + label : label, nps: s.nps, n: s.total };
    });
  return { points, unit };
}

/* NPS per rated staff member. Small denominators are the norm here (this is a
   handful of calls a day), so the minimum sample is SHOWN as the response count
   next to each bar rather than used to hide rows — a person with two scores is
   a fact about coverage, and dropping them would hide the auditors nobody is
   reviewing. Sorted worst-first: the point of the chart is who needs attention. */
function byStaff(scored: ScoredCall[]): Array<{ name: string; nps: number; n: number }> {
  const m = new Map<string, number[]>();
  for (const s of scored) {
    const name = s.staffName || 'Not recorded';
    if (!m.has(name)) m.set(name, []);
    m.get(name)!.push(s.q1);
  }
  return [...m.entries()]
    .map(([name, scores]) => ({ name, ...npsFrom(scores) }))
    .filter((x) => x.nps !== null)
    .map((x) => ({ name: x.name, nps: x.nps as number, n: x.total }))
    .sort((a, b) => a.nps - b.nps || b.n - a.n);
}

function distribution(scored: ScoredCall[]): Array<{ score: number; count: number }> {
  const counts = new Array(11).fill(0) as number[];
  for (const s of scored) if (s.q1 >= 0 && s.q1 <= 10) counts[s.q1]++;
  return counts.map((count, score) => ({ score, count })).filter((d) => d.score > 0);
}

/* Diverging bar list rather than a Recharts BarChart, on purpose.

   A bar chart draws NOTHING for a value of exactly 0 — no bar, and Recharts
   skips the label too — and "worst first" sorting puts precisely that row at the
   top. The one person a reader most needs to see was the one row with nothing on
   it (live: an auditor on NPS 0 from 2 scores, rendered blank). Built from divs
   the same way the store-visit dashboard's "response mix" block is, so a zero
   gets a visible tick at the centre line and its own number, and the sample size
   rides along — an NPS of +100 off one score should not read like an NPS of +100
   off forty. */
function StaffBars({ rows }: { rows: Array<{ name: string; nps: number; n: number }> }) {
  const tone = (nps: number) => (nps >= 50 ? C.promoter : nps >= 0 ? C.neutral : C.detractor);
  return (
    <div>
      {rows.map((d) => {
        const mag = Math.min(100, Math.abs(d.nps)) / 2; // % of the full track, which spans -100..100
        return (
          <div key={d.name} className="mb-2 flex items-center gap-2 last:mb-0">
            <div className="w-[104px] shrink-0 truncate text-right text-[11.5px] font-medium text-gray-700" title={d.name}>{d.name}</div>
            <div className="relative h-4 min-w-0 flex-1 rounded bg-gray-50">
              <div className="absolute bottom-0 left-1/2 top-0 w-px bg-gray-300" />
              <div
                className="absolute bottom-0.5 top-0.5 rounded-sm"
                style={{
                  background: tone(d.nps),
                  left: d.nps >= 0 ? '50%' : (50 - mag) + '%',
                  width: mag + '%',
                  // A 0 still has to be visible: a 2px tick on the centre line.
                  minWidth: 2,
                }}
              />
            </div>
            <div className="w-[98px] shrink-0 whitespace-nowrap text-[11.5px] tabular-nums text-gray-500">
              <b className="text-gray-800">{fmtSigned(d.nps)}</b> · {d.n} score{d.n === 1 ? '' : 's'}
            </div>
          </div>
        );
      })}
      <div className="mt-2 flex justify-between pl-[112px] pr-[106px] text-[10px] text-gray-400">
        <span>−100</span><span>0</span><span>+100</span>
      </div>
    </div>
  );
}

function CoverageBar({ label, p }: { label: string; p: ReviewProgress }) {
  const pct = p.due ? Math.round((p.scored / p.due) * 100) : null;
  const bg = pct == null ? '#D1D5DB' : pct >= 80 ? C.promoter : pct >= 50 ? C.neutral : C.detractor;
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
        <span className="font-semibold text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-500">{pct == null ? '—' : pct + '%'} · {p.scored} scored of {p.due} due</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full" style={{ width: (pct ?? 0) + '%', background: bg }} />
      </div>
      <div className="mt-0.5 text-[11px] text-gray-400">{p.called} called · {Math.max(0, p.called - p.scored)} reached without a score</div>
    </div>
  );
}

function exportCsv(rows: ScoredCall[], r: DateRange) {
  const cell = (v: any) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Called on', 'Type', 'Client / job', 'Rated staff', 'Q1 overall', 'Q2 staff', 'Q3 cleanliness', 'Band'];
  const body = rows.map((s) => [
    s.at, s.orderType, s.label, s.staffName || '', s.q1, s.q2, s.q3, npsBand(s.q1),
  ].map(cell).join(','));
  const blob = new Blob([[head.map(cell).join(',')].concat(body).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'coe-nps-' + (r.from || 'all') + '-to-' + (r.to || 'now') + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function NpsAnalytics({ orders, installs, installByPhone }: {
  orders: CoeOrder[];
  installs: CoeInstall[];
  installByPhone: Map<string, CoeInstall[]>;
}) {
  const [preset, setPreset] = useState<DatePresetKey>('last30');
  const [range, setRange] = useState<DateRange>(() => presetRange('last30'));
  const [side, setSide] = useState<Side>('both');

  const all = useMemo(() => scoredCalls(orders, installs), [orders, installs]);
  const sided = useMemo(() => (side === 'both' ? all : all.filter((s) => s.orderType === side)), [all, side]);

  const inRange = useMemo(() => sided.filter((s) => inDateRange(s.at, range)), [sided, range]);
  /* The immediately preceding window of the same length, for the "vs prev"
     deltas. `null` on an unbounded range — "before all time" is not a period,
     and inventing one would put a delta on a tile that cannot have one. */
  const prevWindow = useMemo(() => previousRange(range), [range]);
  const inPrev = useMemo(
    () => (prevWindow ? sided.filter((s) => inDateRange(s.at, prevWindow)) : []),
    [sided, prevWindow],
  );

  const cur: NpsSummary = useMemo(() => npsFrom(inRange.map((s) => s.q1)), [inRange]);
  const prev: NpsSummary | null = useMemo(
    () => (prevWindow ? npsFrom(inPrev.map((s) => s.q1)) : null),
    [inPrev, prevWindow],
  );

  const pct = (n: number) => (cur.total ? Math.round((n / cur.total) * 100) : null);
  const prevPct = (n: number) => (prev && prev.total ? Math.round((n / prev.total) * 100) : null);

  const trend = useMemo(() => buildTrend(inRange, range), [inRange, range]);
  const staff = useMemo(() => byStaff(inRange), [inRange]);
  const dist = useMemo(() => distribution(inRange), [inRange]);

  /* Coverage is deliberately ALL-TIME, not range-scoped — the same choice
     ⭐ Review scores makes and for the same reason: the queue it describes is
     "every review currently owed", which is exactly what the two calling tabs
     work off. Range-scoping it would invent a denominator that no bucket count
     on this dashboard agrees with. Said on screen, not just here. */
  const aProgress = useMemo(() => auditReviewProgress(followupRows(orders, installByPhone)), [orders, installByPhone]);
  const iProgress = useMemo(() => installReviewProgress(installReviewRows(installs)), [installs]);

  const q1 = inRange.map((s) => s.q1);
  const q2 = inRange.map((s) => s.q2);
  const q3 = inRange.map((s) => s.q3);
  const q2Label = side === 'install' ? 'Q2 · Installer' : side === 'audit' ? 'Q2 · Auditor' : 'Q2 · Field staff';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-bold text-black">Review scores → NPS</h1>
          <p className="text-[13px] text-gray-400">
            Every score the Category Ops team has captured on a D+1 call, over the range you pick. Read from the call
            logs themselves, not from the analytics table.
          </p>
        </div>
        <button
          onClick={() => exportCsv(inRange, range)}
          disabled={!inRange.length}
          className="ml-auto shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 disabled:opacity-40"
        >
          ⬇ CSV
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRangeFilter label="Date the call was made" preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
        <div className="flex overflow-hidden rounded-md border border-gray-200">
          {SIDES.map((s) => (
            <button
              key={s.k}
              onClick={() => setSide(s.k)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${side === s.k ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-600'}`}
            >
              {s.l}
            </button>
          ))}
        </div>
        <div className="text-[11.5px] text-gray-400">{NPS_HOUSE_NOTE}</div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile
          label="Field-service NPS" accent={C.line}
          value={cur.nps == null ? '—' : fmtSigned(cur.nps)}
          valueClass={cur.nps == null ? 'text-gray-400' : cur.nps >= 50 ? 'text-green-600' : cur.nps >= 0 ? 'text-amber-600' : 'text-red-600'}
          delta={<Delta cur={cur.nps} prev={prev?.nps ?? null} unit=" pts" />}
        />
        <Tile
          label="Q1 · Overall" accent="#8B5CF6"
          value={avgScore(q1) == null ? '—' : String(avgScore(q1))}
          sub="out of 10"
          delta={<Delta cur={avgScore(q1)} prev={prevWindow ? avgScore(inPrev.map((s) => s.q1)) : null} dec={1} />}
        />
        <Tile
          label="Scores captured" accent="#14B8A6"
          value={String(cur.total)}
          sub={inRange.length !== cur.total ? inRange.length + ' calls, ' + cur.total + ' usable' : 'D+1 calls with a score'}
          delta={<Delta cur={cur.total} prev={prev?.total ?? null} />}
        />
        <Tile
          label={NPS_BAND_LABELS.promoter} accent={C.promoter}
          value={pct(cur.prom) == null ? '—' : pct(cur.prom) + '%'}
          valueClass="text-green-600"
          sub={cur.prom + ' of ' + cur.total}
          delta={<Delta cur={pct(cur.prom)} prev={prevPct(prev?.prom ?? 0)} unit=" pp" />}
        />
        <Tile
          label={NPS_BAND_LABELS.neutral} accent={C.neutral}
          value={pct(cur.neu) == null ? '—' : pct(cur.neu) + '%'}
          sub={cur.neu + ' of ' + cur.total}
        />
        <Tile
          label={NPS_BAND_LABELS.detractor} accent={C.detractor}
          value={pct(cur.det) == null ? '—' : pct(cur.det) + '%'}
          valueClass="text-red-600"
          sub={cur.det + ' of ' + cur.total}
          delta={<Delta cur={pct(cur.det)} prev={prevPct(prev?.det ?? 0)} unit=" pp" dir={-1} />}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        <Tile label={q2Label} accent="#0EA5E9" value={avgScore(q2) == null ? '—' : String(avgScore(q2))} sub="out of 10 · behaviour of the person who did the job" />
        <Tile label="Q3 · Site left clean" accent="#F97316" value={avgScore(q3) == null ? '—' : String(avgScore(q3))} sub="out of 10" />
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Review coverage · all time</div>
          <CoverageBar label="Site audits" p={aProgress} />
          <CoverageBar label="Installations" p={iProgress} />
          <div className="mt-1 text-[11px] text-gray-400">
            Not range-scoped: this is every review currently owed, matching the Overdue buckets on the calling tabs.
          </div>
        </div>
      </div>

      <div className="mb-3">
        <Card
          title={'NPS trend · by ' + trend.unit}
          caption={'A break in the line is a ' + trend.unit + ' nobody was called on, not a zero. Expect the last day or two to be thin — a D+1 call for yesterday’s job has not happened yet.'}
        >
          {trend.points.some((p) => p.nps !== null) ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend.points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                <ReferenceLine y={0} stroke="#D1D5DB" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                  formatter={(v: unknown, n: unknown) => (n === 'nps'
                    ? [v == null ? 'no scores' : fmtSigned(Number(v)), 'NPS']
                    : [v as number, 'Scores'])}
                />
                <Line type="monotone" dataKey="nps" stroke={C.line} strokeWidth={2} dot={{ r: 2.5, fill: C.line }} activeDot={{ r: 5 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty msg="No scores captured in this range." />}
        </Card>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="NPS by rated staff" caption="Worst first — the number beside each bar is how many scores it rests on. Two scores is a fact about coverage, not a verdict on the person.">
          {staff.length ? <StaffBars rows={staff} /> : <Empty msg="No scores captured in this range." />}
        </Card>

        <Card title="Q1 score distribution" caption="How many clients gave each 1–10 rating, on Material Depot's bands">
          {dist.length ? (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={dist} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="score" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    formatter={(v: unknown) => [v as number, 'Scores']}
                    labelFormatter={(l: unknown) => 'Q1 = ' + l}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {dist.map((d, i) => <Cell key={i} fill={d.score >= 9 ? C.promoter : d.score === 8 ? C.neutral : C.detractor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-gray-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.promoter }} />{NPS_BAND_LABELS.promoter}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.neutral }} />{NPS_BAND_LABELS.neutral}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.detractor }} />{NPS_BAND_LABELS.detractor}</span>
              </div>
            </>
          ) : <Empty msg="No scores captured in this range." />}
        </Card>
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Every score in this range ({inRange.length})
      </div>
      {inRange.length ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Called</th>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Rated staff</th>
                <th className="px-3 py-2">Q1</th>
                <th className="px-3 py-2">Q2</th>
                <th className="px-3 py-2">Q3</th>
                <th className="px-3 py-2">Band</th>
              </tr>
            </thead>
            <tbody>
              {inRange.slice(0, 300).map((s) => {
                const b = npsBand(s.q1);
                return (
                  <tr key={s.key} className="border-t border-gray-100 text-[12.5px]">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{fmtDate(s.at)}</td>
                    <td className="px-3 py-2">{s.label}</td>
                    <td className="px-3 py-2 text-gray-600">{s.staffName || '—'}</td>
                    <td className="px-3 py-2 font-mono font-bold">{s.q1}</td>
                    <td className="px-3 py-2 font-mono">{s.q2}</td>
                    <td className="px-3 py-2 font-mono">{s.q3}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BAND_PILL[b]}`}>{b}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {inRange.length > 300 ? (
            <div className="border-t border-gray-100 px-3 py-2 text-[11.5px] text-gray-400">
              Showing the 300 most recent of {inRange.length} — narrow the range, or take the CSV, to see the rest.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-[13px] text-gray-400">
          No scores captured in this range.
          {all.length ? null : ' No Category Ops call anywhere in this data carries one yet — scores start appearing here as soon as the D+1 calls are logged.'}
        </div>
      )}
    </div>
  );
}

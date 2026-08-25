'use client';

/* Category Ops → ⭐ Review scores.

   The COE has been collecting Q1/Q2/Q3 on every D+1 call since note 117 and
   had nowhere to see the result — the numbers only existed in Admin's
   Analytics, which the COE role can't reach. So the person doing the work
   couldn't tell a good week from a bad one, or notice that scores had stopped
   reaching the analytics table at all.

   Everything here is computed from the CALL LOG (coe_track.calls[] /
   subjobs[].coe_review.calls[]), never from the `ratings` table. That's
   deliberate: the call log is the source of truth, `ratings` is a projection
   of it, and this tab's whole job includes showing when the two disagree. */

import { useMemo, useState } from 'react';
import {
  NPS_BAND_LABELS, NPS_HOUSE_NOTE, avgScore, fmtDate, npsBand, npsFrom,
} from '../siteAuditShared';
import {
  auditReviewProgress, followupRows, installReviewProgress, installReviewRows,
  pushScoredCalls, scoredCalls, unprojectedScoredCalls,
  type CoeInstall, type CoeOrder, type RatingRow, type ReviewProgress, type ScoredCall,
} from './shared';

const PERIODS: Array<{ k: string; l: string; days: number | null }> = [
  { k: '30', l: 'Last 30 days', days: 30 },
  { k: '90', l: 'Last 90 days', days: 90 },
  { k: 'all', l: 'All time', days: null },
];

function cutoffFor(days: number | null): string | null {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function NpsCard({ label, scores, sub }: { label: string; scores: number[]; sub: string }) {
  const s = npsFrom(scores);
  if (s.nps === null)
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="mt-1 font-mono text-[22px] font-bold text-gray-400">—</div>
        <div className="mt-1 text-[11px] text-gray-400">No scores captured yet</div>
      </div>
    );
  const c = s.nps >= 50 ? 'text-green-600' : s.nps >= 0 ? 'text-amber-600' : 'text-red-600';
  const pct = (n: number) => Math.round((n / s.total) * 100);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>{s.nps >= 0 ? '+' : ''}{s.nps}</div>
      <div className="mt-1.5 flex flex-col gap-0.5 text-[11px]">
        <span className="text-green-600">▲ {pct(s.prom)}% {NPS_BAND_LABELS.promoter}</span>
        <span className="text-gray-500">● {pct(s.neu)}% {NPS_BAND_LABELS.neutral}</span>
        <span className="text-red-600">▼ {pct(s.det)}% {NPS_BAND_LABELS.detractor}</span>
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{s.total} score{s.total !== 1 ? 's' : ''} · {sub}</div>
    </div>
  );
}

function AvgCard({ label, scores }: { label: string; scores: number[] }) {
  const a = avgScore(scores);
  const c = a == null ? 'text-gray-400' : a >= 8 ? 'text-green-600' : a >= 6 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>{a == null ? '—' : a}<span className="text-sm text-gray-400">/10</span></div>
      <div className="mt-1 text-[11px] text-gray-400">{scores.length} score{scores.length !== 1 ? 's' : ''}</div>
    </div>
  );
}

/* Coverage, not just score. 20 tens out of 200 completed jobs is not a +100,
   and the gap between "due" and "scored" is the COE's actual worklist. */
function CoverageCard({ label, p }: { label: string; p: ReviewProgress }) {
  const pct = p.due ? Math.round((p.scored / p.due) * 100) : null;
  const c = pct == null ? 'text-gray-400' : pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>{pct == null ? '—' : pct + '%'}</div>
      <div className="mt-1 text-[11px] text-gray-500">{p.scored} scored of {p.due} due</div>
      <div className="text-[11px] text-gray-400">{p.called} called · {p.called - p.scored} reached no score</div>
    </div>
  );
}

const BAND_PILL = {
  promoter: 'bg-green-50 text-green-700',
  neutral: 'bg-gray-100 text-gray-600',
  detractor: 'bg-red-50 text-red-700',
} as const;

export default function ReviewScores({ orders, installs, installByPhone, ratings, onChanged }: {
  orders: CoeOrder[];
  installs: CoeInstall[];
  installByPhone: Map<string, CoeInstall[]>;
  /* `null` means the ratings load FAILED — not "there are no ratings". The
     difference matters more here than anywhere else in this app: treating a
     failed load as an empty table would mark every score ever captured as
     un-projected and offer to re-push all of them, writing hundreds of
     duplicate rows. So the repair banner is suppressed entirely on null. */
  ratings: RatingRow[] | null;
  onChanged: () => void;
}) {
  const [period, setPeriod] = useState('30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const all = useMemo(() => scoredCalls(orders, installs), [orders, installs]);
  const cutoff = cutoffFor(PERIODS.find((p) => p.k === period)?.days ?? null);
  const inPeriod = useMemo(() => (cutoff ? all.filter((s) => s.at >= cutoff) : all), [all, cutoff]);

  const audit = inPeriod.filter((s) => s.orderType === 'audit');
  const install = inPeriod.filter((s) => s.orderType === 'install');

  /* Coverage is deliberately all-time, not period-scoped: the queue it
     describes is "every review currently owed", which is exactly what the two
     calling tabs work off. Period-scoping it would invent a different
     denominator from the one the Overdue buckets show. */
  const aProgress = useMemo(() => auditReviewProgress(followupRows(orders, installByPhone)), [orders, installByPhone]);
  const iProgress = useMemo(() => installReviewProgress(installReviewRows(installs)), [installs]);

  const missing = useMemo(() => (ratings ? unprojectedScoredCalls(all, ratings) : []), [all, ratings]);

  async function push() {
    setBusy(true);
    setMsg('');
    const res = await pushScoredCalls(missing);
    setBusy(false);
    setMsg(
      res.failed.length
        ? `Pushed ${res.ok} of ${missing.length}. ${res.failed.length} still failing — ${res.failed[0].message}`
        : `Pushed ${res.ok} score${res.ok !== 1 ? 's' : ''} to analytics.`,
    );
    onChanged();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-0 overflow-hidden rounded-md border border-gray-200">
          {PERIODS.map((p) => (
            <button
              key={p.k}
              onClick={() => setPeriod(p.k)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${period === p.k ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-600'}`}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div className="text-[11.5px] text-gray-400">{NPS_HOUSE_NOTE}</div>
      </div>

      {ratings === null ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800">
          ⚠ Couldn&apos;t read the analytics ratings table, so scores that never reached it can&apos;t be checked right now.
          The scores below are read from the call log and are complete either way.
        </div>
      ) : missing.length ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[12.5px] font-semibold text-amber-900">
            ⚠ {missing.length} captured score{missing.length !== 1 ? 's' : ''} never reached the analytics table
          </div>
          <div className="mt-0.5 text-[11.5px] text-amber-800">
            They are safe on the call log — the tiles below already count them — but Analytics&apos; NPS does not.
            Pushing writes each one to `ratings` exactly as the call would have.
          </div>
          <button
            disabled={busy}
            onClick={push}
            className="mt-2 rounded-md bg-amber-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Pushing…' : `Push ${missing.length} to analytics`}
          </button>
          <ul className="mt-2 max-h-32 overflow-y-auto text-[11.5px] text-amber-800">
            {missing.slice(0, 25).map((m) => (
              <li key={m.key}>· {fmtDate(m.at)} — {m.label} (Q1 {m.q1})</li>
            ))}
            {missing.length > 25 ? <li className="text-amber-700">…and {missing.length - 25} more</li> : null}
          </ul>
        </div>
      ) : null}

      {msg ? (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12.5px] font-semibold text-blue-700">{msg}</div>
      ) : null}

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Site audits</div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <NpsCard label="Audit NPS" scores={audit.map((s) => s.q1)} sub="from D+1 calls" />
        <AvgCard label="Q1 · Overall" scores={audit.map((s) => s.q1)} />
        <AvgCard label="Q2 · Auditor" scores={audit.map((s) => s.q2)} />
        <AvgCard label="Q3 · Cleanliness" scores={audit.map((s) => s.q3)} />
        <CoverageCard label="Review coverage" p={aProgress} />
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Installations</div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <NpsCard label="Install NPS" scores={install.map((s) => s.q1)} sub="from D+1 calls" />
        <AvgCard label="Q1 · Overall" scores={install.map((s) => s.q1)} />
        <AvgCard label="Q2 · Installer" scores={install.map((s) => s.q2)} />
        <AvgCard label="Q3 · Cleanliness" scores={install.map((s) => s.q3)} />
        <CoverageCard label="Review coverage" p={iProgress} />
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Scores captured ({inPeriod.length})
      </div>
      {inPeriod.length ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse">
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
              {inPeriod.slice(0, 200).map((s: ScoredCall) => {
                const b = npsBand(s.q1);
                return (
                  <tr key={s.key} className="border-t border-gray-100 text-[12.5px]">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(s.at)}</td>
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
          {inPeriod.length > 200 ? (
            <div className="border-t border-gray-100 px-3 py-2 text-[11.5px] text-gray-400">
              Showing the 200 most recent of {inPeriod.length} — narrow the period to see the rest.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-[13px] text-gray-400">
          No scores captured in this period.
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import {
  addDays, anchorDate, categoriesFor, followupRows, todayStr,
  type CoeInstall, type CoeOrder, type FollowupRow,
} from './shared';
import { WP_STAGES, WP_VENDORS, wpBucket, wpDurations, wpEverReached, wpFmtDur, wpNext, wpSla, wpStageAt, wpStageLabel, type WpBucketKey, type WpNext, type WpRow, type WpSla } from './wpTrack';

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

type WpDerived = { r: WpRow; next: WpNext | null; sla: WpSla; bucket: WpBucketKey };

export default function Insights({ orders, installByPhone, wpRows }: {
  orders: CoeOrder[]; installByPhone: Map<string, CoeInstall[]>; wpRows: WpRow[];
}) {
  const [from, setFrom] = useState(() => addDays(todayStr(), -30));
  const [to, setTo] = useState(() => todayStr());

  const allRows = useMemo(() => followupRows(orders, installByPhone), [orders, installByPhone]);
  const A = useMemo(() => allRows.filter((r) => { const a = anchorDate(r.o); return a && a >= from && a <= to; }), [allRows, from, to]);
  const W = useMemo<WpDerived[]>(() => {
    const now = Date.now();
    return wpRows
      .filter((r) => { const d = String(r.order_placed_at || r.created_at || '').slice(0, 10); return d && d >= from && d <= to; })
      .map((r) => ({ r, next: wpNext(r), sla: wpSla(r, now), bucket: wpBucket(r, now) }));
  }, [wpRows, from, to]);

  // --- conversion funnel ---
  const nAudits = A.length;
  const nReviewed = A.filter((r) => r.cps.find((c) => c.k === 'd1' && c.state === 'done')).length;
  const nPlaced = A.filter((r) => r.placed).length;
  const nLost = A.filter((r) => r.o.coeTrack.result === 'lost').length;
  // Counted directly rather than as nAudits - nPlaced - nLost: a row can be
  // both order-placed and marked lost (the client ordered, then the COE closed
  // it out), which double-subtracts and can drive the tile negative.
  const nOpen = A.filter((r) => !r.placed && r.o.coeTrack.result !== 'lost').length;
  const nChasePending = A.filter((r) => r.bucket === 'overdue' || r.bucket === 'today').length;

  /* --- production funnel: how many of the tracked POs ever reached each step ---
     Reads through wpStageAt, NOT row.stages[k]: the four render/approval steps
     are stored per round inside rounds[], so a raw stages[] lookup finds
     nothing for them and the funnel reported them as never reached. That
     understated "Approved by client" by 19 of 81 POs and drew a 19-order
     cliff at client approval that never happened — in the one tab whose whole
     job is locating where things really stall. */
  const reached = (k: string) => W.filter((x) => !!wpStageAt(x.r, k) || wpEverReached(x.r, k)).length;
  const prodFunnel = WP_STAGES.map((s) => ({ s, n: reached(s.k) }));

  // --- per-stage time + breach, split by vendor ---
  const durs = useMemo(() => { const out: Array<{ k: string; hours: number; vendor: string }> = []; W.forEach((x) => wpDurations(x.r).forEach((d) => out.push(d))); return out; }, [W]);
  const stageStats = WP_STAGES.map((s) => {
    const all = durs.filter((d) => d.k === s.k);
    const byV: Record<string, { n: number; med: number | null }> = {};
    WP_VENDORS.forEach((v) => {
      const xs = all.filter((d) => d.vendor === v.k).map((d) => d.hours);
      if (xs.length) byV[v.k] = { n: xs.length, med: median(xs) };
    });
    const over = s.slaH ? all.filter((d) => d.hours > s.slaH!).length : 0;
    const stuck = W.filter((x) => x.next?.k === s.k).length;
    const stuckBad = W.filter((x) => x.next?.k === s.k && (x.sla.level === 'breach' || x.sla.level === 'stalled')).length;
    return { s, n: all.length, med: median(all.map((d) => d.hours)), over, byV, stuck, stuckBad };
  });
  const activeVendors = WP_VENDORS.filter((v) => stageStats.some((s) => s.byV[v.k]));

  // --- conversion cut by a chosen dimension ---
  function cut(keyFn: (r: FollowupRow) => string | null | undefined, label: string) {
    const g = new Map<string, { k: string; tot: number; conv: number; chase: number }>();
    A.forEach((r) => {
      const k = keyFn(r) || '—';
      if (!g.has(k)) g.set(k, { k, tot: 0, conv: 0, chase: 0 });
      const e = g.get(k)!;
      e.tot++;
      if (r.placed) e.conv++;
      if (r.bucket === 'overdue') e.chase++;
    });
    return { label, rows: [...g.values()].sort((a, b) => b.tot - a.tot) };
  }
  const cuts = [
    cut((r) => r.o.bm, 'By BM'),
    cut((r) => r.o.auditorName, 'By auditor'),
    cut((r) => categoriesFor(r.o).map((c) => c.l).join(' + ') || '—', 'By category'),
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-bold text-black">Where it stalls</h1>
          <p className="text-[13px] text-gray-400">Drop-off across the whole journey, and how long each production step is really taking.</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-[12.5px]" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-[12.5px]" />
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Site audit → order</h3>
        {nAudits ? (
          <>
            <FunnelBars steps={[{ l: 'Site audits completed', n: nAudits }, { l: 'D+1 client review done', n: nReviewed }, { l: 'Order placed', n: nPlaced }]} total={nAudits} />
            <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-gray-400">
              <div><b className="text-[15px] text-red-600">{nChasePending}</b> awaiting a call right now</div>
              <div><b className="text-[15px] text-gray-900">{nLost}</b> explicitly marked lost</div>
              <div><b className="text-[15px] text-gray-900">{nOpen}</b> neither ordered nor closed out</div>
            </div>
          </>
        ) : <div className="text-[13px] text-gray-400">No completed site audits in this range.</div>}
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Custom wallpaper production</h3>
        {W.length ? <FunnelBars steps={prodFunnel.map((f) => ({ l: wpStageLabel(f.s.k, 'other'), n: f.n }))} total={W.length} /> : <div className="text-[13px] text-gray-400">No wallpaper orders placed in this range.</div>}
      </div>

      {W.length ? (
        <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Production step</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Target</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Median</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Over target</th>
                {activeVendors.map((v) => <th key={v.k} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{v.label}</th>)}
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sitting here now</th>
              </tr>
            </thead>
            <tbody>
              {stageStats.map((x) => (
                <tr key={x.s.k} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 text-[13px] font-bold text-gray-900">{wpStageLabel(x.s.k, 'other')}</td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-700">{x.s.slaH ? x.s.slaH + 'h' + (x.s.soft ? ' (soft)' : '') : <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-700">{x.med != null ? wpFmtDur(x.med) : <span className="text-gray-400">—</span>}{x.n ? <div className="text-[11px] text-gray-400">{x.n} observation{x.n === 1 ? '' : 's'}</div> : null}</td>
                  <td className="px-3 py-2.5 text-[13px]">{!x.s.slaH ? <span className="text-gray-400">—</span> : x.over ? <span className="font-bold text-red-600">{x.over}</span> : <span className="text-gray-400">0</span>}</td>
                  {activeVendors.map((v) => <td key={v.k} className="px-3 py-2.5 text-[13px] text-gray-700">{x.byV[v.k] ? wpFmtDur(x.byV[v.k].med) : <span className="text-gray-400">—</span>}</td>)}
                  <td className="px-3 py-2.5 text-[13px] text-gray-700">{x.stuck ? <>{x.stuck}{x.stuckBad ? <span className="font-bold text-red-600"> ({x.stuckBad} late)</span> : null}</> : <span className="text-gray-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-100 px-3.5 py-2.5 text-[11.5px] text-gray-400">
            Median is measured from the moment the previous step was marked done. Every render round counts as its own observation, so a job that took three renders contributes three data points — that is deliberate, it is what makes a slow render cycle visible. Steps showing "—" under Target are <b>measured, not policed</b>: their time is recorded and compared, but no target is enforced against them.
          </div>
        </div>
      ) : null}

      {nAudits ? cuts.map((c) => (
        <div key={c.label} className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{c.label}</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Audits</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ordered</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Conversion</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Overdue calls</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => {
                const p = pct(r.conv, r.tot);
                return (
                  <tr key={r.k} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 text-[13px] font-bold text-gray-900">{r.k}</td>
                    <td className="px-3 py-2.5 text-[13px] text-gray-700">{r.tot}</td>
                    <td className="px-3 py-2.5 text-[13px] text-gray-700">{r.conv}</td>
                    <td className="px-3 py-2.5 text-[13px]"><b className={p >= 50 ? 'text-green-700' : p >= 25 ? 'text-amber-600' : 'text-red-600'}>{p}%</b></td>
                    <td className="px-3 py-2.5 text-[13px]">{r.chase ? <span className="font-bold text-red-600">{r.chase}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )) : null}
    </div>
  );
}

function FunnelBars({ steps, total }: { steps: Array<{ l: string; n: number }>; total: number }) {
  return (
    <div>
      {steps.map((s, i) => {
        const w = total ? Math.max(2, Math.round((s.n / total) * 100)) : 0;
        const prev = i ? steps[i - 1].n : null;
        // A later step can legitimately show MORE rows than the one before it
        // (back-filled data, a step never explicitly stamped), and "↓ -3 lost
        // here" reads as a bug. Only report a real decrease.
        const drop = prev != null && prev > s.n ? prev - s.n : null;
        return (
          <div key={s.l} className="mb-2.5">
            <div className="flex items-baseline gap-2 text-[12.5px]">
              <div className="min-w-0 flex-1 text-gray-700">{s.l}</div>
              <b className="text-[14px] text-gray-900">{s.n}</b>
              <span className="w-11 text-right text-gray-400">{pct(s.n, total)}%</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-gray-100">
              <div className="h-full" style={{ width: w + '%', background: w >= 66 ? '#1f7a3f' : w >= 33 ? '#9a6200' : '#b3261e' }} />
            </div>
            {drop ? <div className="mt-0.5 text-[11px] text-red-600">↓ {drop} lost here</div> : null}
          </div>
        );
      })}
    </div>
  );
}

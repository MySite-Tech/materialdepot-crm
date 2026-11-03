'use client';

import { fmtL } from '../../../../../models/mock-data';
import { FUNNEL_BUCKETS, FUNNEL_STAGES, FunnelBucket, FunnelCell, FunnelEnquiry, FunnelStage, RevenueOrder, funnelRows } from '@/lib/b2b/revenue';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFunnelReport } from '../../../hooks/use-funnel-report';
import { Card, Hint, Notice } from '../../../ui';
import { OrderDrawer } from '../ui/order-drawer';
import { monthOptions, share } from '../utils';
import { FUNNEL_META, FUNNEL_OPEN_KEY, STAGE_META } from './constants';

const SELECT = 'px-2 py-1 text-[11px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 cursor-pointer';

const readOpen = (): boolean => {
  try { return localStorage.getItem(FUNNEL_OPEN_KEY) === '1'; } catch { return false; }
};

const explain = (o: RevenueOrder) => {
  const meta = FUNNEL_META[(o as FunnelEnquiry).funnel];
  return { label: meta.label, color: meta.color, reason: meta.rule, funnel: true };
};

function Cell({ cell, base, onOpen }: { cell: FunnelCell; base: number | null; onOpen: () => void }) {
  return (
    <td className="px-3 py-2.5 text-right align-top">
      <button onClick={onOpen} disabled={!cell.count} className="text-right cursor-pointer disabled:cursor-default hover:underline disabled:no-underline">
        <div className="tabular-nums text-[14px] font-semibold text-gray-900">{cell.count}</div>
        <div className="tabular-nums text-[11px] text-gray-500">{fmtL(cell.value)}</div>
        {base !== null && <div className="tabular-nums text-[10px] text-gray-400">{share(cell.count, base)} of carts</div>}
      </button>
    </td>
  );
}

export function ClientFunnel({ refreshKey }: { refreshKey: number }) {
  const months = useMemo(() => monthOptions(new Date()), []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [open, setOpen] = useState(false);
  const [fellBack, setFellBack] = useState(false);
  const monthPicked = useRef(false);
  const month = months.find((m) => m.key === monthKey) ?? months[0];
  const { report, error, busy, reload } = useFunnelReport(month.from, month.to, open, refreshKey);
  const [drawer, setDrawer] = useState<{ title: string; cell: FunnelCell } | null>(null);

  useEffect(() => { setOpen(readOpen()); }, []);

  useEffect(() => {
    if (monthPicked.current || monthKey !== months[0].key) return;
    if (report?.from === months[0].from && !report.enquiries.length) {
      setMonthKey(months[1].key);
      setFellBack(true);
    }
  }, [report, monthKey, months]);

  const rows = useMemo(() => funnelRows(report?.enquiries ?? []), [report]);

  const show = () => {
    setOpen(true);
    try { localStorage.setItem(FUNNEL_OPEN_KEY, '1'); } catch {}
  };
  const pick = (b: FunnelBucket | 'all', s: FunnelStage) => {
    const label = b === 'all' ? 'All three' : FUNNEL_META[b].label;
    setDrawer({ title: `${label} · ${STAGE_META[s].label} · ${month.label}`, cell: rows[b][s] });
  };

  return (
    <Card className={busy ? 'opacity-80 transition-opacity' : 'transition-opacity'}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
            Client Database · revenue funnel
            <Hint text="Carts raised in the month on a number of a Client Database firm, split by who was involved, and how far each got. By cart date, so Ordered here is not the same set as the revenue above, which is by order date." />
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {report ? `Carts raised in ${month.label} on the numbers of ${report.firms.toLocaleString('en-IN')} firms` : 'EC direct · EC referred · Studio direct, from enquiry to delivery'}
          </p>
        </div>
        {open && (
          <select aria-label="Month" value={monthKey} onChange={(e) => { monthPicked.current = true; setFellBack(false); setMonthKey(e.target.value); }} className={SELECT}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        )}
      </div>

      {!open && (
        <button onClick={show} className="mt-3 px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-[#0F766E] hover:border-gray-300 cursor-pointer">
          Show the funnel
        </button>
      )}
      {open && busy && !report && <p className="text-[12px] text-gray-400 mt-3">Reading every cart raised in {month.label}…</p>}
      {fellBack && <p className="text-[11px] text-gray-500 mt-2">{months[0].label} has no carts on these firms yet, so this opens on {month.label}.</p>}
      {error && (
        <div className="mt-3">
          <Notice title="The funnel could not be read.">{error}. Nothing below is a zero. <button onClick={reload} className="underline cursor-pointer">Retry</button></Notice>
        </div>
      )}
      {report && !report.studioOk && (
        <div className="mt-3"><Notice title="Studio Space numbers did not load.">A firm&rsquo;s own Studio numbers are left out of EC referred, so EC direct may read high.</Notice></div>
      )}
      {report && !report.redirectsOk && (
        <div className="mt-3"><Notice title="EC redirects did not load.">Logged redirects are left out, so EC direct may read high.</Notice></div>
      )}
      {report && !report.teamOk && (
        <div className="mt-3"><Notice title="The B2B team did not load.">Reps are matched on the built-in roster only, so Studio direct may read low.</Notice></div>
      )}
      {report?.truncated && (
        <div className="mt-3"><Notice title="This month has more carts than one read covers.">The figures are incomplete.</Notice></div>
      )}

      {report && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead>
              <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                <th className="text-left font-semibold px-3 py-2">Who was involved</th>
                {FUNNEL_STAGES.map((s) => (
                  <th key={s} className="text-right font-semibold px-3 py-2">
                    <span className="inline-flex items-center gap-1">{STAGE_META[s].label}<Hint text={STAGE_META[s].hint} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FUNNEL_BUCKETS.map((b) => (
                <tr key={b} className="border-b border-gray-50">
                  <td className="px-3 py-2.5 align-top max-w-[260px]">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-800">
                      <span className="w-2 h-2 rounded-sm" style={{ background: FUNNEL_META[b].color }} />
                      {FUNNEL_META[b].label}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{FUNNEL_META[b].rule}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{rows[b].enquiry.firms} firm{rows[b].enquiry.firms === 1 ? '' : 's'}</div>
                  </td>
                  {FUNNEL_STAGES.map((s) => (
                    <Cell key={s} cell={rows[b][s]} base={s === 'enquiry' ? null : rows[b].enquiry.count} onOpen={() => pick(b, s)} />
                  ))}
                </tr>
              ))}
              <tr className="bg-gray-50/60">
                <td className="px-3 py-2.5 font-semibold text-gray-800">
                  All three
                  <div className="text-[11px] font-normal text-gray-500 tabular-nums">{rows.all.enquiry.firms} firm{rows.all.enquiry.firms === 1 ? '' : 's'}</div>
                </td>
                {FUNNEL_STAGES.map((s) => (
                  <Cell key={s} cell={rows.all[s]} base={s === 'enquiry' ? null : rows.all.enquiry.count} onOpen={() => pick('all', s)} />
                ))}
              </tr>
            </tbody>
          </table>
          {report.referredSkipped > 0 && (
            <p className="text-[11px] text-gray-500 mt-2 tabular-nums">
              {report.referredSkipped} cart{report.referredSkipped === 1 ? ' is' : 's are'} left out: the number is also a client a Studio Space partner referred, so it counts as Referred above.
            </p>
          )}
        </div>
      )}

      {drawer && (
        <OrderDrawer
          title={drawer.title}
          orders={drawer.cell.enquiries}
          explain={explain}
          onClose={() => setDrawer(null)}
        />
      )}
    </Card>
  );
}

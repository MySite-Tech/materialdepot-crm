'use client';

/* The custom-wallpaper production ladder, read-only.

   Lives in its own module because two very different screens render the same
   ladder: the Category Ops Executive's Wallpaper tab (which also stamps the
   next step) and a BM's own order book (which only ever reads it). Keeping one
   copy is what stops the BM being shown a stage list that has drifted from the
   one the COE is actually working. Nothing here writes — every mutation stays
   in Wallpaper.tsx, where the COE's own drawer lives. */

import { fmtLog } from '../siteAuditShared';
import {
  WP_DECISIONS, wpFmtDur, wpNext, wpRounds, wpSla, wpStageLabel, wpVendor, type WpRow,
} from './wpTrack';

/* Read-only ladder — TSX port of md-wp-track.js's mdWpLadderHtml. */
export default function WpLadder({ row }: { row: WpRow }) {
  const v = wpVendor(row.vendor);
  const rounds = wpRounds(row);
  const next = wpNext(row);
  const sla = wpSla(row);

  let slaBadge: React.ReactNode = null;
  if (next && sla.imported) {
    slaBadge = <span className="text-gray-400">{wpFmtDur(sla.hours)} since the order was placed</span>;
  } else if (next && sla.level === 'none') {
    slaBadge = sla.from ? <span className="text-gray-400">{wpFmtDur(sla.hours)} at this step</span> : null;
  } else if (next) {
    const col = sla.level === 'breach' ? 'text-red-600' : sla.level === 'stalled' || sla.level === 'soon' ? 'text-amber-600' : 'text-gray-400';
    const word = sla.level === 'breach' ? 'SLA breached' : sla.level === 'stalled' ? 'Stalled' : sla.level === 'soon' ? 'Due soon' : 'On track';
    slaBadge = <span className={`font-bold ${col}`}>{word}{sla.from ? ' · ' + wpFmtDur(sla.hours) + ' at this step' : ''}{sla.slaH ? ' (target ' + sla.slaH + 'h)' : ''}</span>;
  }

  function Row({ label, at, note, byName, doneColor, isNext }: { label: string; at: string | null; note?: string; byName?: string | null; doneColor?: string; isNext?: boolean }) {
    const done = !!at;
    return (
      <div className="flex gap-2.5 py-1.5">
        {done ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-extrabold text-white" style={{ background: doneColor || '#1f7a3f' }}>✓</span>
        ) : (
          <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${isNext ? 'border-amber-500' : 'border-gray-200'}`} />
        )}
        <div className="min-w-0 flex-1">
          <div className={`text-[12.5px] ${done || isNext ? 'font-bold' : ''} ${done ? 'text-gray-900' : isNext ? 'text-[#1F3A5F]' : 'text-gray-400'}`}>{label}</div>
          {at ? <div className="text-[11px] text-gray-400">{fmtLog(at)}{byName ? ' · ' + byName : ''}</div> : null}
          {note ? <div className="mt-0.5 text-[11.5px]">{note}</div> : null}
        </div>
      </div>
    );
  }
  function stepRow(k: string) {
    const e = (row.stages || {})[k];
    const isNext = !!(next && next.k === k);
    return <Row key={k} label={wpStageLabel(k, row.vendor)} at={e?.at || null} note={e?.note} byName={e?.by?.name} isNext={isNext} />;
  }

  return (
    <div>
      <div className="mb-2 text-[12px] text-gray-400">
        <b className="text-[#1F3A5F]">{v.label}</b>{row.md_id ? ' · ' + row.md_id : ''}{rounds.length > 1 ? ' · round ' + rounds.length : ''}
        {next ? (
          <div className="mt-0.5">Next: <b className="text-[#1F3A5F]">{next.label}</b> — {slaBadge}</div>
        ) : (
          <div className="mt-0.5 font-bold text-green-700">{row.state === 'cancelled' ? 'PO cancelled' : 'All steps complete'}</div>
        )}
      </div>

      {stepRow('dimensions_shared')}

      {rounds.map((r, i) => {
        const multi = rounds.length > 1;
        const isCurrentRound = i === rounds.length - 1;
        const ap = r.approval || null;
        const dec = ap?.decision ? WP_DECISIONS.find((d) => d.k === ap.decision) : null;
        return (
          <div key={i}>
            {multi ? <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Round {i + 1}</div> : null}
            {(['render_generated', 'render_to_bm', 'render_to_client'] as const).map((k) => {
              const e = (r as any)[k];
              const isNext = !!(next && next.k === k && isCurrentRound);
              return <Row key={k} label={wpStageLabel(k, row.vendor)} at={e?.at || null} note={e?.note} byName={e?.by?.name} isNext={isNext} />;
            })}
            <Row
              label={wpStageLabel('client_approval', row.vendor) + (dec ? ' — ' + dec.l : '')}
              at={ap?.at || null} note={ap?.note} byName={ap?.by?.name}
              doneColor={dec ? (dec.cancels ? '#b3261e' : dec.loops ? '#9a6200' : '#1f7a3f') : undefined}
              isNext={isCurrentRound && !!next && next.k === 'client_approval'}
            />
          </div>
        );
      })}

      {(['sent_for_printing', 'dispatched', 'at_warehouse', 'out_for_delivery', 'delivered', 'install_scheduled'] as const).map((k) => stepRow(k))}

      {row.notes ? <div className="mt-2.5 rounded-lg bg-gray-50 px-2.5 py-2 text-[12px]"><b>Notes:</b> {row.notes}</div> : null}
      {row.imported ? (
        <div className="mt-2 border-l-2 border-gray-200 pl-2 text-[11.5px] text-gray-400">
          Imported from the vendor spreadsheet. The sheet only recorded whether each step was done, not when — so the dates above are the order date, and this order is left out of the step-timing averages.
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { fmtL, fmtShortINR } from '../../../../models/mock-data';
import { Pill } from '../../ui';
import type { Totals } from '../types';
import { bridge, pctChange, signedL } from '../utils';

const count = (n: number) => n.toLocaleString('en-IN');

function Tile({ label, now, before, fmt, beforeLabel, children }: {
  label: string;
  now: number | null;
  before: number | null;
  fmt: (n: number) => string;
  beforeLabel: string;
  children?: React.ReactNode;
}) {
  const pct = now !== null && before !== null ? pctChange(now, before) : null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 min-w-0">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
        <span className="tabular-nums text-[22px] font-bold text-gray-900 leading-tight">{now === null ? 'Unknown' : fmt(now)}</span>
        {pct !== null && (
          <Pill tone={pct >= 0 ? 'good' : 'bad'}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%</Pill>
        )}
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{beforeLabel} {before === null ? 'unknown' : fmt(before)}</div>
      {children}
    </div>
  );
}

export function KpiStrip({ focus, compare, compareLabel }: {
  focus: Totals | null;
  compare: Totals | null;
  compareLabel: string;
}) {
  const b = focus && compare ? bridge(focus, compare) : null;
  const delta = focus && compare ? focus.value - compare.value : null;
  const vs = `vs ${compareLabel}`;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile label="Revenue" now={focus?.value ?? null} before={compare?.value ?? null} fmt={fmtL} beforeLabel={vs}>
        {b && delta !== null && delta !== 0 && (
          <div className="text-[11px] text-gray-600 mt-1.5 pt-1.5 border-t border-gray-100 tabular-nums leading-relaxed">
            <span className="font-semibold whitespace-nowrap">{signedL(delta, fmtL)}</span>
            {': '}
            <span className="whitespace-nowrap">{signedL(b.volume, fmtL)}</span>
            {` from ${focus!.orders >= compare!.orders ? 'more' : 'fewer'} orders, `}
            <span className="whitespace-nowrap">{signedL(b.ticket, fmtL)}</span>
            {` from ${focus!.aov >= compare!.aov ? 'bigger' : 'smaller'} orders`}
          </div>
        )}
      </Tile>
      <Tile label="Orders" now={focus?.orders ?? null} before={compare?.orders ?? null} fmt={count} beforeLabel={vs} />
      <Tile label="Firms ordering" now={focus?.firms ?? null} before={compare?.firms ?? null} fmt={count} beforeLabel={vs} />
      <Tile label="Average order" now={focus ? Math.round(focus.aov) : null} before={compare ? Math.round(compare.aov) : null} fmt={fmtShortINR} beforeLabel={vs} />
    </div>
  );
}

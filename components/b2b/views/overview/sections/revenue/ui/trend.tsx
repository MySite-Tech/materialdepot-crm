'use client';

import { fmtL } from '../../../../../models/mock-data';
import { REVENUE_CHANNELS, RevenueTrend, TrendMonth } from '@/lib/b2b/revenue';
import { useState } from 'react';
import { Notice } from '../../../ui';
import { CHANNEL_META } from '../constants';

const PLOT_HEIGHT = 120;

const totalOf = (m: TrendMonth) => REVENUE_CHANNELS.reduce((s, c) => s + m[c], 0);

const shortMonth = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });

function Tooltip({ m, current }: { m: TrendMonth; current: boolean }) {
  return (
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 w-[176px] rounded-lg bg-gray-900 text-white px-3 py-2 text-[11px] shadow-lg pointer-events-none">
      <div className="font-semibold mb-1">{m.label}{current ? ' · so far' : ''}</div>
      {REVENUE_CHANNELS.map((c) => (
        <div key={c} className="flex items-center gap-1.5 tabular-nums">
          <span className="w-2 h-2 rounded-sm" style={{ background: CHANNEL_META[c].color }} />
          <span className="text-gray-300">{CHANNEL_META[c].label}</span>
          <span className="ml-auto font-semibold">{fmtL(m[c])}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-white/20 mt-1 pt-1 tabular-nums font-semibold">
        <span>Total</span><span>{fmtL(totalOf(m))}</span>
      </div>
      {m.truncated && <div className="text-amber-300 mt-1">More orders than one read covers: incomplete</div>}
    </div>
  );
}

export function RevenueTrendChart({ trend, error, selected, onPick, onRetry }: {
  trend: RevenueTrend | null;
  error: string | null;
  selected: string;
  onPick: (key: string) => void;
  onRetry: () => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  if (error) {
    return (
      <div className="mt-5">
        <Notice title="Month by month could not be read.">{error}. <button onClick={onRetry} className="underline cursor-pointer">Retry</button></Notice>
      </div>
    );
  }

  const months = trend?.months ?? [];
  const max = Math.max(1, ...months.map(totalOf));
  const current = months[months.length - 1]?.key;

  return (
    <div className="mt-5 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-[12px] font-bold text-gray-700">Month by month</h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {REVENUE_CHANNELS.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: CHANNEL_META[c].color }} />
              {CHANNEL_META[c].label}
            </span>
          ))}
        </div>
      </div>
      {!trend ? (
        <div className="rounded-lg bg-gray-50 animate-pulse" style={{ height: PLOT_HEIGHT + 44 }} />
      ) : (
        <div className="grid gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m) => {
            const total = totalOf(m);
            const isSelected = m.key === selected;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onPick(m.key)}
                onMouseEnter={() => setHover(m.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(m.key)}
                onBlur={() => setHover(null)}
                aria-pressed={isSelected}
                aria-label={`${m.label}: ${fmtL(total)}`}
                className={`relative flex flex-col items-center rounded-lg pt-1 pb-1.5 cursor-pointer transition-colors ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                {hover === m.key && <Tooltip m={m} current={m.key === current} />}
                <span className="flex flex-col justify-end items-center w-full" style={{ height: PLOT_HEIGHT + 20 }}>
                  <span className={`tabular-nums text-[11px] font-semibold mb-1 ${total ? 'text-gray-700' : 'text-gray-300'}`}>{total ? fmtL(total) : '—'}</span>
                  <span className="flex flex-col-reverse gap-[2px] w-full max-w-[44px]" style={{ height: (total / max) * PLOT_HEIGHT }}>
                    {REVENUE_CHANNELS.filter((c) => m[c] > 0).map((c, i, shown) => (
                      <span
                        key={c}
                        className={`block w-full ${i === shown.length - 1 ? 'rounded-t' : ''}`}
                        style={{ flexGrow: m[c], flexBasis: 0, minHeight: 2, background: CHANNEL_META[c].color }}
                      />
                    ))}
                  </span>
                </span>
                <span className="w-full max-w-[56px] border-t border-gray-200" />
                <span className={`text-[11px] mt-1 ${isSelected ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{shortMonth(m.key)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

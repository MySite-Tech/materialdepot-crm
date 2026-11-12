'use client';

import { fmtL } from '../../../models/mock-data';
import { PerfValue } from '../../../models/performance/types';
import { CHANNEL_META } from '../../overview/sections/revenue/constants';
import { REVENUE_CHANNELS, RevenueChannel, RevenueOrder } from '@/lib/b2b/revenue';

export interface RevenueTarget {
  targetL: number | null;
  pace: number | null;
}

const channelOrders = (orders: RevenueOrder[], c: RevenueChannel) => orders.filter((o) => o.channel === c);

export function RevenueHero({ title, sub, value, target, loading, error, note, onOpen }: {
  title: string;
  sub: string;
  value: PerfValue;
  target: RevenueTarget;
  loading: boolean;
  error: string | null;
  note?: React.ReactNode;
  onOpen: (title: string, orders: RevenueOrder[]) => void;
}) {
  const orders = value.orders ?? [];
  const rupees = orders.reduce((s, o) => s + o.value, 0);
  const channels = value.channels;
  const { targetL, pace } = target;
  const achieved = targetL ? Math.round(((value.value ?? 0) / targetL) * 100) : null;
  const expected = pace !== null ? Math.round(pace * 100) : null;
  const ahead = achieved !== null && expected !== null ? achieved >= expected : null;
  const unknown = !loading && (value.unknown || !!error);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-gray-500">{title}</div>
          <div className="flex items-baseline gap-3 flex-wrap mt-1">
            <span className={`tabular-nums text-[36px] sm:text-[42px] leading-none font-bold ${loading ? 'text-gray-300' : 'text-gray-900'}`}>
              {loading ? '…' : unknown ? 'Unknown' : fmtL(rupees)}
            </span>
            {targetL !== null && !loading && !unknown && <span className="text-[13px] text-gray-400">of {fmtL(targetL * 1_00_000)} target</span>}
            {achieved !== null && !loading && !unknown && (
              <span className={`text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 border ${ahead === false ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                {achieved}%{ahead === null ? ' of target' : ahead ? ' · ahead of pace' : ` · behind pace (${expected}% by today)`}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-gray-400 mt-1.5">{unknown ? error || value.sub : value.sub || sub}</div>
        </div>
        {!loading && !unknown && orders.length > 0 && (
          <button onClick={() => onOpen(title, orders)} className="text-[12px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
            See all {orders.length} order{orders.length === 1 ? '' : 's'} →
          </button>
        )}
      </div>

      {!loading && !unknown && channels && (
        <>
          <div className="relative mt-5">
            <div className="flex h-3 w-full rounded-full bg-gray-100 overflow-hidden gap-[2px]">
              {REVENUE_CHANNELS.filter((c) => channels[c] > 0).map((c) => {
                const base = targetL ? Math.max(targetL * 1_00_000, rupees) : rupees;
                return (
                  <div key={c} title={`${CHANNEL_META[c].label}: ${fmtL(channels[c])}`}
                    className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(channels[c] / base) * 100}%`, background: CHANNEL_META[c].color }} />
                );
              })}
            </div>
            {expected !== null && targetL !== null && (
              <span title="Where revenue should be today" className="absolute -top-1 w-[2px] h-5 rounded bg-gray-800" style={{ left: `calc(${Math.min(100, expected)}% - 1px)` }} />
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
            {REVENUE_CHANNELS.map((c) => {
              const list = channelOrders(orders, c);
              const share = rupees ? Math.round((channels[c] / rupees) * 100) : 0;
              return (
                <button key={c} disabled={!list.length} onClick={() => onOpen(`${title} · ${CHANNEL_META[c].label}`, list)} title={CHANNEL_META[c].hint}
                  className="text-left rounded-xl border border-gray-200 px-3.5 py-3 min-w-0 enabled:hover:border-gray-300 enabled:hover:shadow-sm enabled:cursor-pointer disabled:opacity-60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-gray-600 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHANNEL_META[c].color }} />
                      <span className="truncate">{CHANNEL_META[c].label}</span>
                    </span>
                    <span className="text-[11px] text-gray-400 tabular-nums">{share}%</span>
                  </div>
                  <div className="tabular-nums text-[20px] font-bold text-gray-900 mt-1">{channels[c] > 0 ? fmtL(channels[c]) : '—'}</div>
                  <div className="text-[11px] text-gray-400">{list.length ? `${list.length} order${list.length === 1 ? '' : 's'} · ${new Set(list.map((o) => o.firm)).size} firm${new Set(list.map((o) => o.firm)).size === 1 ? '' : 's'}` : 'None'}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {note && <div className="mt-3 text-[11.5px] text-gray-500">{note}</div>}
    </section>
  );
}

'use client';

import { fmtL } from '../../../models/mock-data';
import { MonthPace } from '../types';
import { Card, Hint, Pill, Stat } from '../ui';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export function RevenueHero({ pace, sources }: {
  pace: MonthPace;
  sources: { source: string; value: number; color: string }[];
}) {
  const hasTarget = pace.target > 0;
  const onTrack = pace.projection >= pace.target;
  const ahead = pace.achievedPct >= pace.expectedPct;
  const slices = sources.filter((s) => s.value > 0);

  return (
    <Card className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6 lg:gap-8">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
          Revenue · {pace.monthLabel} so far
          <Hint text="Orders won at the B2B branch this month, by order-placed date. The target is set on the Targets tab." />
        </div>
        <div className="flex items-baseline gap-3 flex-wrap mt-1">
          <span className="tabular-nums text-[34px] sm:text-[40px] leading-none font-bold text-gray-900">{fmtL(pace.revenue)}</span>
          {hasTarget && <span className="text-[13px] text-gray-400">of {fmtL(pace.target)}</span>}
          {hasTarget && <Pill tone={ahead ? 'good' : 'warn'}>{pace.achievedPct}% · {ahead ? 'ahead of pace' : 'behind pace'}</Pill>}
        </div>

        {hasTarget && (
          <div className="mt-5">
            <div className="relative h-3 rounded-full bg-gray-100">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#0F766E] transition-[width] duration-500"
                style={{ width: `${Math.min(100, pace.achievedPct)}%` }}
              />
              <div
                className="absolute -top-1 -bottom-1 w-0.5 bg-gray-800 rounded"
                style={{ left: `${Math.min(100, pace.expectedPct)}%` }}
                title={`Where revenue should be today: ${pace.expectedPct}% of target`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
              <span>₹0</span>
              <span>▲ today&rsquo;s pace {pace.expectedPct}%</span>
              <span>{fmtL(pace.target)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-100">
          <Stat
            label="Month-end projection"
            value={fmtL(pace.projection)}
            sub={hasTarget ? <span className={onTrack ? 'text-green-700' : 'text-red-500'}>{onTrack ? 'On track' : `${fmtL(pace.target - pace.projection)} short`}</span> : undefined}
          />
          <Stat label="Needed per day" value={hasTarget ? fmtL(pace.perDayNeeded) : '—'} sub="to hit target" />
          <Stat label="Days left" value={String(pace.daysLeft)} sub="in the month" />
        </div>
      </div>

      <div className="min-w-0 lg:border-l lg:border-gray-100 lg:pl-8">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 mb-2">
          Where it came from
          <Hint text="Split by the rep holding the cart. Grey is revenue booked at B2B on carts held by someone outside the B2B roster." />
        </div>
        {!slices.length ? (
          <p className="text-[12px] text-gray-400 py-10 text-center">No orders won yet this month.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-[120px] h-[120px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="source" innerRadius={38} outerRadius={58} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {slices.map((s) => <Cell key={s.source} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtL(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {sources.map((s) => (
                <div key={s.source} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="truncate text-gray-600">{s.source}</span>
                  </span>
                  <span className="tabular-nums font-semibold text-gray-800 whitespace-nowrap">{fmtL(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

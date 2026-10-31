'use client';

import { fmtL } from '../../../../../models/mock-data';
import { ChannelSplit, REVENUE_CHANNELS, RevenueChannel } from '@/lib/b2b/revenue';
import { CHANNEL_META } from '../constants';

export function TargetBar({ splits, target, expectedPct }: {
  splits: Record<RevenueChannel, ChannelSplit>;
  target: number;
  expectedPct: number | null;
}) {
  const total = REVENUE_CHANNELS.reduce((s, c) => s + splits[c].value, 0);
  const scale = Math.max(target, total, 1);
  const pctOf = (n: number) => (n / scale) * 100;

  return (
    <div className="mt-5">
      <div className="relative h-3">
        <div className="absolute inset-0 rounded-full bg-gray-100" />
        <div className="absolute inset-y-0 left-0 flex gap-[2px] rounded-full overflow-hidden" style={{ width: `${pctOf(total)}%` }}>
          {REVENUE_CHANNELS.filter((c) => splits[c].value > 0).map((c) => (
            <div
              key={c}
              title={`${CHANNEL_META[c].label}: ${fmtL(splits[c].value)}`}
              className="h-full min-w-[3px] transition-[flex-grow] duration-500"
              style={{ flexGrow: splits[c].value, background: CHANNEL_META[c].color }}
            />
          ))}
        </div>
        {expectedPct !== null && target > 0 && (
          <div
            className="absolute -top-1 -bottom-1 w-0.5 bg-gray-800 rounded"
            style={{ left: `${pctOf(target * (expectedPct / 100))}%` }}
            title={`Where revenue should be today: ${expectedPct}% of target`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
        <span>₹0</span>
        {expectedPct !== null && target > 0 && <span>▲ today&rsquo;s pace {expectedPct}%</span>}
        {target > 0 && <span>{fmtL(target)}</span>}
      </div>
    </div>
  );
}

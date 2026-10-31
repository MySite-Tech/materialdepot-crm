'use client';

import { fmtL } from '../../../../../models/mock-data';
import { ChannelSplit, RevenueChannel } from '@/lib/b2b/revenue';
import { Hint } from '../../../ui';
import { CHANNEL_META } from '../constants';
import { share } from '../utils';

function SplitRow({ label, value, of, color }: { label: string; value: number; of: number; color: string }) {
  return (
    <div className="grid grid-cols-[112px_1fr_56px] items-center gap-2 text-[11px]">
      <span className="text-gray-500 truncate">{label}</span>
      <span className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: of > 0 ? `${Math.max(value > 0 ? 3 : 0, (value / of) * 100)}%` : 0, background: color }}
        />
      </span>
      <span className="tabular-nums text-right font-semibold text-gray-700">{fmtL(value)}</span>
    </div>
  );
}

export function ChannelCard({ channel, split, total, selected, unknown, onSelect }: {
  channel: RevenueChannel;
  split: ChannelSplit;
  total: number;
  selected: boolean;
  unknown: boolean;
  onSelect: () => void;
}) {
  const meta = CHANNEL_META[channel];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col text-left rounded-xl border p-4 bg-white cursor-pointer transition-colors min-w-0 ${selected ? 'border-gray-800 ring-1 ring-gray-800' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <div className="flex items-center gap-2 w-full">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: meta.color }} />
        <span className="text-[12px] font-semibold text-gray-600">{meta.label}</span>
        <Hint text={meta.hint} />
        {!unknown && <span className="ml-auto text-[11px] tabular-nums text-gray-400">{share(split.value, total)}</span>}
      </div>
      <div className="tabular-nums text-[24px] leading-tight font-bold text-gray-900 mt-2">{unknown ? 'Unknown' : fmtL(split.value)}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">
        {unknown ? 'Studio Space numbers did not load' : `${split.orders} order${split.orders === 1 ? '' : 's'} · ${split.firms} firm${split.firms === 1 ? '' : 's'}`}
      </div>
      {!unknown && (
        <div className="flex flex-col gap-1.5 mt-3">
          <SplitRow label="KAM" value={split.kam} of={split.value} color={meta.color} />
          {channel !== 'referred' && <SplitRow label="Inbound · Outreach" value={split.field} of={split.value} color={meta.color} />}
        </div>
      )}
    </button>
  );
}

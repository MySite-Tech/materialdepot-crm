'use client';

import { fmtL } from '../../../../../models/mock-data';
import { CHANNEL_TYPES, ChannelSplit, OrderType, RevenueChannel } from '@/lib/b2b/revenue';
import { Hint } from '../../../ui';
import { CHANNEL_META, TYPE_META } from '../constants';
import { share } from '../utils';

function TypeRow({ type, value, of, color, selected, onSelect }: {
  type: OrderType;
  value: number;
  of: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      aria-pressed={selected}
      disabled={!value}
      className={`grid grid-cols-[minmax(0,1fr)_48px_52px] items-center gap-2 text-[11px] rounded px-1 -mx-1 py-0.5 text-left cursor-pointer disabled:cursor-default ${selected ? 'bg-gray-100' : 'hover:bg-gray-50 disabled:hover:bg-transparent'}`}
    >
      <span title={TYPE_META[type].rule} className={`truncate ${selected ? 'font-semibold text-gray-900' : value ? 'text-gray-600' : 'text-gray-300'}`}>{TYPE_META[type].label}</span>
      <span className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: of > 0 ? `${Math.max(value > 0 ? 4 : 0, (value / of) * 100)}%` : 0, background: color }}
        />
      </span>
      <span className={`tabular-nums text-right font-semibold ${value ? 'text-gray-700' : 'text-gray-300'}`}>{value ? fmtL(value) : '—'}</span>
    </button>
  );
}

export function ChannelCard({ channel, split, total, selected, selectedType, unknown, note, onSelect, onType }: {
  channel: RevenueChannel;
  split: ChannelSplit;
  total: number;
  selected: boolean;
  selectedType: OrderType | 'all';
  unknown: boolean;
  note?: string;
  onSelect: () => void;
  onType: (t: OrderType) => void;
}) {
  const meta = CHANNEL_META[channel];
  const types = CHANNEL_TYPES[channel].length > 1 ? CHANNEL_TYPES[channel] : [];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
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
      <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
        {unknown ? 'Studio Space numbers did not load' : `${split.orders} order${split.orders === 1 ? '' : 's'} · ${split.firms} firm${split.firms === 1 ? '' : 's'}`}
      </div>
      {!unknown && !!types.length && (
        <div className="flex flex-col gap-0.5 mt-3">
          {types.map((t) => (
            <TypeRow
              key={t}
              type={t}
              value={split.types[t] ?? 0}
              of={split.value}
              color={meta.color}
              selected={selected && selectedType === t}
              onSelect={() => onType(t)}
            />
          ))}
        </div>
      )}
      {!unknown && note && <div className="text-[11px] text-gray-500 mt-3 tabular-nums">{note}</div>}
    </div>
  );
}

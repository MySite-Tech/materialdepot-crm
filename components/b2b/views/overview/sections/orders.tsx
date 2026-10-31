'use client';

import { fmtL } from '../../../models/mock-data';
import { BASIS_HINT, BASIS_LABELS, RANGE_LABELS } from '../constants';
import { RangeKey } from '../types';
import { Card, SectionHead, Segmented, StackBar } from '../ui';
import { B2BPipelineStats, StatsBasis } from '@/lib/b2b';

export function OrdersSection({ stats, open, range, basis, busy, onRange, onBasis, onOpenPipeline }: {
  stats: B2BPipelineStats;
  open: { count: number; value: number };
  range: RangeKey;
  basis: StatsBasis;
  busy: boolean;
  onRange: (k: RangeKey) => void;
  onBasis: (k: StatsBasis) => void;
  onOpenPipeline: () => void;
}) {
  const unit = basis === 'order' ? 'orders' : 'carts';
  const headline = [
    { key: 'total', label: basis === 'order' ? 'Booked' : 'Carts raised', b: stats.total, color: '#111827' },
    { key: 'won', label: 'Won', b: stats.won, color: '#15803D' },
    ...(basis === 'order' ? [] : [{ key: 'active', label: 'Still open', b: stats.active, color: '#B45309' }]),
    { key: 'lost', label: 'Lost / refunded', b: stats.lost, color: '#9CA3AF' },
  ];

  return (
    <Card className={busy ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <SectionHead
        title="Orders on the B2B branch"
        hint={`${BASIS_HINT[basis]} Open carts are always counted by cart date — an open cart has no order date yet.`}
        right={(
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented options={BASIS_LABELS} value={basis} onChange={onBasis} />
            <Segmented options={RANGE_LABELS} value={range} onChange={onRange} />
          </div>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-stretch">
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {headline.map((h) => (
              <div key={h.key}>
                <div className="text-[11px] text-gray-500">{h.label}</div>
                <div className="tabular-nums text-xl font-bold mt-0.5" style={{ color: h.color }}>{fmtL(h.b.value)}</div>
                <div className="text-[11px] text-gray-400">{h.b.count} {unit}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <StackBar parts={[
              { key: 'Won', value: stats.won.value, color: '#22C55E' },
              { key: 'Open', value: stats.active.value, color: '#EAB308' },
              { key: 'Lost', value: stats.lost.value, color: '#D1D5DB' },
            ]} />
          </div>
        </div>

        <button
          onClick={onOpenPipeline}
          className="text-left rounded-lg border border-[#0F766E]/25 bg-[#0F766E]/5 hover:bg-[#0F766E]/10 px-4 py-3 cursor-pointer transition-colors lg:min-w-[200px]"
        >
          <div className="text-[11px] text-[#0F766E] font-semibold">Open carts</div>
          <div className="tabular-nums text-xl font-bold text-[#0F766E] mt-0.5">{fmtL(open.value)}</div>
          <div className="text-[11px] text-gray-500">{open.count} waiting to convert · See them →</div>
        </button>
      </div>

      {stats.byStatus.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="text-[11px] text-gray-500 mb-2">Where these {unit} stand now</div>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {[...stats.byStatus].sort((a, b) => b.value - a.value).map((s) => (
              <div key={s.status} className="shrink-0">
                <div className="rounded-lg bg-gray-50 px-3 py-2 min-w-[118px]">
                  <div className="tabular-nums text-lg font-bold text-gray-900 leading-tight">{s.count}</div>
                  <div className="text-[10px] font-semibold text-gray-500 truncate" title={s.status}>{s.status}</div>
                  <div className="tabular-nums text-[11px] text-gray-400 mt-0.5">{fmtL(s.value)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

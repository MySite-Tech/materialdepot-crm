'use client';

import { BranchPieTooltipProps, LostPieTooltipProps } from '../types';
import { fmtINR } from '../utils';

export function BranchPieTooltip({ active, payload, total }: BranchPieTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
  return (
    <div className="bg-[#1A1A1A] text-white px-3 py-2.5 rounded-lg shadow-xl text-[11px] min-w-[160px]">
      <div className="font-bold mb-1.5 text-[#EAB308]">{d.status}</div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Leads</span><span className="font-semibold">{d.count} ({pct}%)</span></div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Value</span><span className="font-semibold font-mono">{fmtINR(d.value)}</span></div>
    </div>
  );
}

export function LostPieTooltip({ active, payload }: LostPieTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1A1A1A] text-white px-3 py-2.5 rounded-lg shadow-xl text-[11px] min-w-[160px]">
      <div className="font-bold mb-1.5 text-[#EAB308]">{d.reason}</div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Leads</span><span className="font-semibold">{d.count} · {d.pct}%</span></div>
      <div className="flex justify-between gap-3"><span className="text-gray-400">Value</span><span className="font-semibold font-mono">{fmtINR(d.value)}</span></div>
    </div>
  );
}

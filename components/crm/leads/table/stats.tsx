'use client';

import { Lead } from '../../../../types/crm';
import { fmtINR } from '../../utils';

export function LeadsStats({ activeCount, filtered, lostCount, pctActive, pctLost, pctWon, pipelineActive, pipelineLost, pipelineTotal, pipelineWon, statsLoading, wonCount }: {
  activeCount: number;
  filtered: Lead[];
  lostCount: number;
  pctActive: number;
  pctLost: number;
  pctWon: number;
  pipelineActive: number;
  pipelineLost: number;
  pipelineTotal: number;
  pipelineWon: number;
  statsLoading: boolean;
  wonCount: number;
}) {
  return (
    <div className="bg-white rounded-lg px-4 sm:px-6 py-4 border border-gray-200">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:flex sm:justify-between sm:gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Pipeline<span className="hidden sm:inline"> Value</span></div>
          {statsLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse mt-1" /> : <div className="font-mono text-[13px] sm:text-[22px] font-bold text-black break-all sm:break-normal">{fmtINR(pipelineTotal)}</div>}
          {statsLoading ? <div className="h-3 w-12 bg-gray-100 rounded animate-pulse mt-1" /> : <div className="text-[11px] text-gray-400">{filtered.length} leads</div>}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Pipeline</div>
          {statsLoading ? <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mt-1" /> : <div className="font-mono text-[13px] sm:text-lg font-bold text-[#EAB308] break-all sm:break-normal">{fmtINR(pipelineActive)}</div>}
          {statsLoading ? <div className="h-3 w-12 bg-gray-100 rounded animate-pulse mt-1" /> : <div className="text-[11px] text-gray-400">{activeCount} leads</div>}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Won</div>
          {statsLoading ? <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mt-1" /> : <div className="font-mono text-[13px] sm:text-lg font-bold text-green-700 break-all sm:break-normal">{fmtINR(pipelineWon)}</div>}
          {statsLoading ? <div className="h-3 w-12 bg-gray-100 rounded animate-pulse mt-1" /> : <div className="text-[11px] text-gray-400">{wonCount} leads</div>}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lost<span className="hidden sm:inline"> / Refunded</span></div>
          {statsLoading ? <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mt-1" /> : <div className="font-mono text-[13px] sm:text-lg font-bold text-gray-400 break-all sm:break-normal">{fmtINR(pipelineLost)}</div>}
          {statsLoading ? <div className="h-3 w-12 bg-gray-100 rounded animate-pulse mt-1" /> : <div className="text-[11px] text-gray-400">{lostCount} leads</div>}
        </div>
      </div>
      <div className="flex h-1.5 rounded-sm overflow-hidden mt-4 bg-gray-200">
        <div className="bg-green-500 transition-[width] duration-300" style={{ width: pctWon + '%' }} />
        <div className="bg-[#EAB308] transition-[width] duration-300" style={{ width: pctActive + '%' }} />
        <div className="bg-gray-400 transition-[width] duration-300" style={{ width: pctLost + '%' }} />
      </div>
    </div>
  );
}

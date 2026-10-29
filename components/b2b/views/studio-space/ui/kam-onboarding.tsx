'use client';

import { STUDIO_LENS, STUDIO_ONBOARDING_TARGET_PCT } from '../constants';
import { KamOnboarding } from '../types';

export function KamOnboardingTable({ rows, onPickKam }: { rows: KamOnboarding[]; onPickKam: (kam: string) => void }) {
  if (!rows.length) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-3 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[13px] font-bold text-gray-800">Studio Space onboarding by KAM</h2>
        <span className="text-[10px] text-gray-400" title={STUDIO_LENS.onboarded.rule}>
          Target {STUDIO_ONBOARDING_TARGET_PCT}% of assigned firms with at least one onboarded number
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[420px]">
          <tbody>
            {rows.map((r) => {
              const hit = r.pct !== null && r.pct >= STUDIO_ONBOARDING_TARGET_PCT;
              return (
                <tr key={r.kam || '—'} onClick={() => r.kam && onPickKam(r.kam)} className={`border-t border-gray-50 first:border-t-0 ${r.kam ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                  <td className="px-4 py-2 font-semibold text-gray-700">{r.kam || <span className="text-red-600">No KAM</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">{r.onboarded} of {r.firms} firms</td>
                  <td className="px-3 py-2 w-[40%]">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pct ?? 0)}%`, background: hit ? '#16A34A' : '#F59E0B' }} />
                    </div>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${hit ? 'text-green-700' : 'text-amber-700'}`}>{r.pct === null ? '—' : `${r.pct}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

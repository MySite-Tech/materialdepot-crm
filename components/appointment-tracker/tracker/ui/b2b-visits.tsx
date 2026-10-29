'use client';

import { shortDate } from '../utils';
import type { EcVisit } from '@/lib/b2b/ec-visits';

export type B2BVisitsState =
  | { kind: 'loading' }
  | { kind: 'ready'; visits: EcVisit[] }
  | { kind: 'failed'; error: string };

export function B2BVisits({ state, branch }: { state: B2BVisitsState; branch: string }) {
  if (state.kind === 'loading') return null;
  if (state.kind === 'failed') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-[12px] text-amber-800">
        B2B assisted visits could not be loaded ({state.error}), so any booked for {branch} are not shown here.
      </div>
    );
  }
  const visits = state.visits.filter((v) => v.branch === branch && v.status !== 'Cancelled');
  if (!visits.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-4 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-900">B2B assisted visits · {branch}</h3>
        <span className="text-[11px] text-gray-400">Booked by the B2B team, not in Kylas</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {visits.map((v) => (
          <li key={v.id} className="px-4 py-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-gray-800">
                {shortDate(v.visitDate)}{v.visitTime ? ` · ${v.visitTime}` : ''} · {v.firm}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {[v.contactName, v.phone, v.bmName && `BM ${v.bmName}`, v.scheduledBy && `B2B: ${v.scheduledBy}`].filter(Boolean).join(' · ')}
              </div>
              {v.purpose && <div className="text-[11px] text-gray-600 mt-0.5">{v.purpose}</div>}
            </div>
            <span className="text-[10px] font-semibold text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">{v.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

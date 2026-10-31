'use client';

import type { KamDashboard } from '../../../models/analytics';
import { DAILY_CALL_TARGET } from '../../../models/kam';
import { fmtL } from '../../../models/mock-data';
import { OverviewTarget } from '../types';
import { kamDeskRows, pctOf } from '../utils';
import { Card, LinkButton, SectionHead } from '../ui';

const callColor = (pct: number) => (pct >= 100 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444');

export function KamDesk({ k, unresolved, onNavigate }: {
  k: KamDashboard;
  unresolved: number;
  onNavigate?: (t: OverviewTarget) => void;
}) {
  const rows = kamDeskRows(k);
  const teamPct = pctOf(k.complianceTotals.logged, k.complianceTotals.target);

  return (
    <Card>
      <SectionHead
        title="KAM desk"
        hint={`One row per KAM. Calls are counted once per client per day against ${DAILY_CALL_TARGET} a day. Revenue is closed orders at deal-ticket value.`}
        right={(
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              Calls today
              <span className="tabular-nums font-bold text-gray-800">{k.complianceTotals.logged}/{k.complianceTotals.target}</span>
              <span className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, teamPct)}%`, background: callColor(teamPct) }} />
              </span>
            </div>
            <LinkButton onClick={onNavigate && (() => onNavigate('kams'))}>KAM tab</LinkButton>
          </div>
        )}
      />

      {!!unresolved && (
        <p className="text-[11px] text-amber-800 bg-amber-50 rounded-md px-2.5 py-1.5 mb-3">
          {unresolved} KAM order{unresolved === 1 ? '' : 's'} with an Enquiry ID that has not matched a deal ticket{' '}
          count{unresolved === 1 ? 's' : ''} as ₹0 until fixed on the KAM tab.
        </p>
      )}

      {!rows.length ? (
        <p className="text-[12px] text-gray-400 py-6 text-center">No KAM holds an account yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="text-left font-semibold py-2 px-1">KAM</th>
                <th className="text-right font-semibold py-2 px-1">Firms</th>
                <th className="text-right font-semibold py-2 px-1">Active</th>
                <th className="text-right font-semibold py-2 px-1">Open orders</th>
                <th className="text-right font-semibold py-2 px-1">Pipeline</th>
                <th className="text-right font-semibold py-2 px-1">Revenue</th>
                <th className="text-left font-semibold py-2 px-1 pl-4">Calls today</th>
                <th className="text-right font-semibold py-2 px-1">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = pctOf(r.logged, r.callTarget);
                return (
                  <tr key={r.kam} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="py-2 px-1 font-medium text-gray-800 whitespace-nowrap">{r.kam}</td>
                    <td className="py-2 px-1 text-right tabular-nums text-gray-600">{r.clients}</td>
                    <td className="py-2 px-1 text-right tabular-nums text-gray-600">
                      {r.active}
                      {!!r.unknown && <span className="text-gray-300" title={`${r.unknown} with unreadable order dates`}> +{r.unknown}?</span>}
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums text-gray-600">{r.openOrders}</td>
                    <td className="py-2 px-1 text-right tabular-nums text-gray-700 whitespace-nowrap">{fmtL(r.pipeline)}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-bold text-gray-900 whitespace-nowrap">{fmtL(r.revenue)}</td>
                    <td className="py-2 px-1 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: callColor(pct) }} />
                        </span>
                        <span className="tabular-nums text-[11px] text-gray-600">{r.logged}/{r.callTarget}</span>
                      </div>
                    </td>
                    <td className={`py-2 px-1 text-right tabular-nums ${r.overdue ? 'text-red-600 font-bold' : 'text-gray-300'}`}>{r.overdue || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

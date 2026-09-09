'use client';

import { ORDER_DETAIL_PHONE_CAP } from '../../../../../lib/b2b';
import { fmtL } from '../../../models/mock-data';
import { ClientEntity, ClientStatus } from '../../../types/client';
import { AssignedClientRow } from '../../../types/kam';
import { Metric, StatusPill, TemperatureChip } from '../ui';
import { Dispatch, SetStateAction } from 'react';

export function KamClientsView({ capped, clients, filteredRows, search, setDrawerId, setSearch, setStatusFilter, statusFilter }: {
  capped: number;
  clients: ClientEntity[];
  filteredRows: AssignedClientRow[];
  search: string;
  setDrawerId: Dispatch<SetStateAction<string | null>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setStatusFilter: Dispatch<SetStateAction<ClientStatus | "all">>;
  statusFilter: ClientStatus | "all";
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact or number…"
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E] w-full sm:w-[260px]" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ClientStatus)}
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All statuses</option>
          {(['Active', 'Inactive', 'Unknown'] as ClientStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!!capped && (
          <span className="text-[10px] text-blue-600" title={`Beyond the ${ORDER_DETAIL_PHONE_CAP}-number cap`}>
            {capped}{' '}number(s) not date-checked → Unknown
          </span>
        )}
      </div>
    
      {!filteredRows.length ? (
        <p className="text-[12px] text-gray-400 py-8 text-center">
          {clients.length ? 'No client matches these filters.' : 'No assigned clients.'}
        </p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[1040px]">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                  <th className="text-left font-semibold px-3 py-2">Company</th>
                  <th className="text-left font-semibold px-3 py-2">Source</th>
                  <th className="text-left font-semibold px-3 py-2">Contact</th>
                  <th className="text-left font-semibold px-3 py-2">Last order</th>
                  <th className="text-right font-semibold px-3 py-2">Orders</th>
                  <th className="text-right font-semibold px-3 py-2">Avg order</th>
                  <th className="text-right font-semibold px-3 py-2">Total revenue</th>
                  <th className="text-left font-semibold px-3 py-2">Status</th>
                  <th className="text-left font-semibold px-3 py-2">Temp</th>
                  <th className="text-left font-semibold px-3 py-2">Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.client.id} onClick={() => setDrawerId(r.client.id)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-800">{r.company}</div>
                      <div className="text-[10px] text-gray-400">
                        {r.client.kam || 'unassigned'}
                        {r.segment && ` · Segment ${r.segment}`}
                        {r.upcomingProject && <span className="text-[#0F766E]"> · project noted</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.source}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      <span className="font-mono">{r.contactNumber || '—'}</span>
                      {r.contactPerson && <div className="text-[10px] text-gray-400">{r.contactPerson}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap"><Metric value={r.metrics.lastOrderPlaced} state={r.metrics.dateState} /></td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700"><Metric value={r.metrics.orders} state={r.metrics.dateState} /></td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600 whitespace-nowrap"><Metric value={r.metrics.averageOrderValue} state={r.metrics.dateState} format={fmtL} /></td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap"><Metric value={r.metrics.totalRevenue} state={r.metrics.dateState} format={fmtL} /></td>
                    <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                    <td className="px-3 py-2"><TemperatureChip value={r.temperature} previous={r.previousTemperature} at={r.temperatureAt} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.nextFollowUpDate ? (
                        <span className="font-mono" style={{ color: r.followUp === 'overdue' ? '#DC2626' : r.followUp === 'today' ? '#EA580C' : '#4B5563' }}>
                          {r.nextFollowUpDate}
                        </span>
                      ) : <span className="text-gray-300">none set</span>}
                      {r.daysSinceContact !== undefined && <div className="text-[10px] text-gray-400">{r.daysSinceContact}d since contact</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

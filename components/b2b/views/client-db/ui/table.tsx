'use client';

import { fmtDate, fmtGst, fmtPhone } from '../../../drawers/firm/utils';
import { ClientEntity, ClientOrderMetrics, ClientStatus, contactLabel, contactNumbers, currentTemperature, gstNumbers, primaryContact } from '../../../models/client';
import { fmtShortINR } from '../../../models/mock-data';
import { Metric, StatusPill, TemperatureChip } from '../../../ui/client-chips';

export interface ClientListRow {
  client: ClientEntity;
  metrics: ClientOrderMetrics;
  status: ClientStatus;
  days?: number;
}

function More({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="ml-1.5 px-1.5 py-px rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold font-sans">+{n}</span>;
}

export function ClientTable({ rows, onOpen }: { rows: ClientListRow[]; onOpen: (c: ClientEntity) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[1000px]">
        <thead>
          <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-200">
            <th className="text-left font-semibold px-4 py-2.5">Firm</th>
            <th className="text-left font-semibold px-3 py-2.5">Primary contact</th>
            <th className="text-left font-semibold px-3 py-2.5">GST</th>
            <th className="text-right font-semibold px-3 py-2.5">Orders</th>
            <th className="text-right font-semibold px-3 py-2.5">Revenue</th>
            <th className="text-left font-semibold px-3 py-2.5">Last order</th>
            <th className="text-left font-semibold px-3 py-2.5">Status</th>
            <th className="text-left font-semibold px-3 py-2.5">KAM</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ client, metrics, status, days }) => {
            const primary = primaryContact(client.contacts);
            const numbers = contactNumbers(client.contacts);
            const gsts = gstNumbers(client.gsts);
            const temp = currentTemperature(client.interactions);
            return (
              <tr key={client.id} onClick={() => onOpen(client)} className="group border-t border-gray-100 cursor-pointer hover:bg-teal-50/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[13px] text-gray-900">{client.company || <span className="text-gray-300">(unnamed)</span>}</span>
                    {temp && <TemperatureChip value={temp.value} at={temp.at} />}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {[client.clientType, client.segment && `Segment ${client.segment}`].filter(Boolean).join(' · ') || 'Type and segment not set'}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-gray-700 truncate max-w-[220px]">{contactLabel(primary) || <span className="text-gray-300">No name</span>}</div>
                  <div className="font-mono text-[11px] text-gray-500 mt-0.5 whitespace-nowrap">
                    {primary?.number ? fmtPhone(primary.number) : <span className="text-amber-600 font-sans">no number</span>}
                    <More n={numbers.length - 1} />
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {gsts.length
                    ? <span className="font-mono text-[11px] text-gray-600">{fmtGst(gsts[0])}<More n={gsts.length - 1} /></span>
                    : <span className="text-[11px] text-gray-300">No GST</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700"><Metric value={metrics.orders} state={metrics.dateState} /></td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900 whitespace-nowrap"><Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtShortINR} /></td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  <Metric value={metrics.lastOrderPlaced ? fmtDate(metrics.lastOrderPlaced) : undefined} state={metrics.dateState} />
                </td>
                <td className="px-3 py-2.5"><StatusPill status={status} days={days} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {client.kam
                    ? <span className="text-gray-700">{client.kam}</span>
                    : <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">Unassigned</span>}
                </td>
                <td className="pr-3 text-gray-300 group-hover:text-[#0F766E] text-[14px]">›</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

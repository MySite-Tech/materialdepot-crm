'use client';

import { fmtPhone } from '../utils';
import { ClientEntity, ClientOrderMetrics, studioFirmOf } from '../../../models/client';
import { useStudioLogins } from '../../../hooks/use-studio-logins';
import { fmtShortINR } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';

export function ReferredClientsCard({ client, metrics }: { client: ClientEntity; metrics: ClientOrderMetrics }) {
  const studio = useStudioLogins();
  const referrals = studioFirmOf(client, studio.firms)?.referrals ?? [];
  const counted = metrics.studioOrders ?? 0;
  if (!referrals.length && !counted) return null;

  return (
    <SectionCard title="Referred clients" subtitle={`${referrals.length} on Studio Space · read from Studio Space`}>
      {!!counted && (
        <p className="text-[11px] text-gray-500 mb-2">
          {`Revenue here includes ${counted} Studio Space order${counted === 1 ? '' : 's'} worth ${fmtShortINR(metrics.studioRevenue ?? 0)}, placed on team or client numbers not listed on this firm.`}
        </p>
      )}
      {!!referrals.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[460px]">
            <thead>
              <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-200">
                <th className="text-left font-semibold py-1.5 pr-3">Client</th>
                <th className="text-left font-semibold py-1.5 pr-3">Status</th>
                <th className="text-right font-semibold py-1.5 pr-3">Orders</th>
                <th className="text-right font-semibold py-1.5">Value</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.phone} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 pr-3">
                    <div className="font-medium text-gray-800">{r.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{fmtPhone(r.phone)}</div>
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 capitalize">{r.status}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-700">{r.orders}</td>
                  <td className="py-1.5 text-right font-mono text-gray-700">{r.orders ? fmtShortINR(r.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

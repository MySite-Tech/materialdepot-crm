'use client';

import { ClientEntity, ClientOrderMetrics, studioFirmOf } from '../../../models/client';
import { useStudioLogins } from '../../../hooks/use-studio-logins';
import { fmtShortINR } from '../../../models/mock-data';
import { ReferralsCard } from '../../../ui/referrals';

export function ReferredClientsCard({ client, metrics, by }: { client: ClientEntity; metrics: ClientOrderMetrics; by?: string }) {
  const studio = useStudioLogins();
  const referrals = studioFirmOf(client, studio.firms)?.referrals ?? [];
  const counted = metrics.studioOrders ?? 0;
  return (
    <ReferralsCard
      kind="client"
      referrerId={client.id}
      referrerName={client.company}
      by={by}
      studio={referrals.map((r) => ({ name: r.name, phone: r.phone, status: r.status, orders: r.orders, value: r.value }))}
      note={!!counted && (
        <p className="text-[12px] text-gray-500 mb-2">
          {`Revenue here includes ${counted} Studio Space order${counted === 1 ? '' : 's'} worth ${fmtShortINR(metrics.studioRevenue ?? 0)}, placed on team or client numbers not listed on this firm.`}
        </p>
      )}
    />
  );
}

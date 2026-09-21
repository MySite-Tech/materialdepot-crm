'use client';

import { PartnerTotals } from '../../../models/client/partner';
import { fmtL } from '../../../models/mock-data';
import { MetricCard } from './index';

export function PartnerTiles({ clientCount, totals }: {
  clientCount: number;
  totals: PartnerTotals | null;
}) {
  const known = totals?.known === true;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
      <MetricCard
        label="B2B Clients"
        value={String(clientCount)}
        sub="businesses in the Client Database"
      />
      <MetricCard
        label="Power Users"
        value={known ? String(totals!.powerUsers) : 'Unknown'}
        sub={
          known
            ? `${totals!.provisioned} provisioned, no login yet`
            : 'The partner dashboards could not be read'
        }
        subTone={known ? 'muted' : 'warn'}
      />
      <MetricCard
        label="Referral Orders"
        value={known ? fmtL(totals!.referralValue) : 'Unknown'}
        sub={
          known
            ? `${totals!.referralOrders} approved across ${totals!.powerUsers} power ${totals!.powerUsers === 1 ? 'user' : 'users'}${totals!.pendingApproval ? ` · ${totals!.pendingApproval} awaiting approval` : ''}`
            : 'The partner dashboards could not be read'
        }
        subTone={known ? 'muted' : 'warn'}
      />
    </div>
  );
}

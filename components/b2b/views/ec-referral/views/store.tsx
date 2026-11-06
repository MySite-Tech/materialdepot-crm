'use client';

import { useMemo } from 'react';
import { fmtShortINR } from '../../../models/mock-data';
import { useEcReferrals } from '../hooks/use-ec-referrals';
import { RedirectTable, ReferralTable, Stats } from '../ui/tables';
import { redirectTotals } from '../utils';

export function StoreView() {
  const store = useEcReferrals('store');
  const redirects = useMemo(() => store.data?.redirects ?? [], [store.data]);
  const referrals = store.data?.referrals ?? [];
  const t = useMemo(() => redirectTotals(redirects), [redirects]);
  const where = store.data?.ecs?.length ? store.data.ecs.join(', ') : 'every EC';

  if (store.error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
        Redirects did not load ({store.error}). <button onClick={store.reload} className="underline font-semibold">Retry</button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-gray-500">
        Clients the B2B team (Inbound, Outreach and KAM) sent to {store.data ? <b className="text-gray-800">{where}</b> : '…'}, and what they ordered there.
      </p>
      <Stats items={[
        { label: 'Sent to your store', value: store.data ? String(t.sent) : '…' },
        { label: 'Waiting to visit', value: store.data ? String(t.waiting) : '…', sub: 'status Directed' },
        { label: 'Visited', value: store.data ? String(t.visited) : '…' },
        {
          label: 'Ordered at the EC',
          value: store.data ? fmtShortINR(t.value) : '…',
          sub: store.data ? `${t.checked} of ${t.sent} checked by B2B` : undefined,
          warn: !!store.data && t.checked < t.sent,
        },
      ]} />
      <RedirectTable
        title="Sent to your store by B2B"
        sub="Newest first. The B2B team sets the status and checks each client's orders; ask them if a row looks wrong."
        rows={redirects}
        empty={store.data ? 'B2B has not sent any client to your store yet.' : 'Loading…'}
        resetKey={String(redirects.length)}
      />
      <ReferralTable
        title="Your store's referrals to B2B"
        sub="Walk-in B2B clients your team sent to the B2B team."
        rows={referrals}
        orders={store.orders}
        showBy
        empty={store.data ? 'Nobody at your store has referred a client yet.' : 'Loading…'}
        resetKey={String(referrals.length)}
      />
    </div>
  );
}

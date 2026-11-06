'use client';

import { useMemo, useState } from 'react';
import { canSeeAllReferrals, canSeeStoreReferrals } from '@/lib/b2b/ec-referral/utils';
import type { AppUser } from '@/types/crm';
import { AdminView } from './views/admin';
import { ReferView } from './views/refer';
import { StoreView } from './views/store';

type Sub = 'refer' | 'store' | 'admin';

const SUBS: { key: Sub; label: string; blurb: string }[] = [
  { key: 'refer', label: 'Refer a client', blurb: 'A B2B client walked into the store? Send them to the B2B team here, and Outreach will follow up.' },
  { key: 'store', label: 'Sent to your store', blurb: 'Clients the B2B team redirected to your Experience Centre, and your store’s own referrals.' },
  { key: 'admin', label: 'All referrals', blurb: 'Every referral both ways across the company: EC → B2B and B2B → EC.' },
];

export default function EcB2bReferral({ currentUser, branches }: { currentUser: AppUser; branches?: string[] }) {
  const subs = useMemo(() => SUBS.filter((s) =>
    s.key === 'refer' || (s.key === 'store' ? canSeeStoreReferrals(currentUser) : canSeeAllReferrals(currentUser))),
  [currentUser]);
  const [sub, setSub] = useState<Sub>(() => subs[subs.length - 1].key);
  const meta = SUBS.find((s) => s.key === sub)!;

  return (
    <div className="p-4 sm:p-6 max-w-[1100px] mx-auto">
      <h1 className="text-[19px] font-bold text-gray-900">EC B2B Referral</h1>
      <p className="text-[11.5px] text-gray-500 mt-0.5 mb-3">{meta.blurb}</p>
      {subs.length > 1 && (
        <div className="flex rounded-md border border-gray-200 overflow-hidden w-fit mb-4">
          {subs.map((s) => (
            <button key={s.key} onClick={() => setSub(s.key)}
              className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${sub === s.key ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {sub === 'refer' && <ReferView currentUser={currentUser} branches={branches} />}
      {sub === 'store' && <StoreView />}
      {sub === 'admin' && <AdminView />}
    </div>
  );
}

'use client';

import { LeadDeal, OutreachLead, fmtINR } from '../../models/mockData';
import { Empty, SectionCard, Spinner, fmtDay } from '../../ui/inboundChips';

export function OutreachDealsCard({ checkEnq, deals, dealsFailed, draft, set }: {
  checkEnq: (id?: string | undefined) => Promise<void>;
  deals: LeadDeal[] | null;
  dealsFailed: boolean;
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
}) {
  return (
    <SectionCard title="Deal tickets on this number" owner="deals" subtitle="Every cart Procurement holds for this contact">
      {deals === null ? <Spinner label="Loading deal tickets…" />
        : dealsFailed ? (
          <p className="text-[11.5px] text-red-600 leading-snug">
            The deal system did not answer, so this list is unreadable — not empty. Do not read it
            as &ldquo;this client has no carts&rdquo;.
          </p>
        ) : !draft.phone ? (
          <Empty>No contact number on this lead, so no tickets can be matched.</Empty>
        ) : deals.length === 0 ? (
          <Empty>No deal tickets on {draft.phone}.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {deals.map((d) => (
              <button
                key={d.id}
                onClick={() => { set('enqId', d.id); checkEnq(d.id); }}
                className="text-left rounded-md border border-gray-200 px-3 py-2 hover:border-[#0F766E]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-mono font-semibold text-gray-800">{d.id}</span>
                  <span className="text-[12px] font-mono text-gray-700">{fmtINR(d.cartValue)}</span>
                </div>
                <div className="text-[10.5px] text-gray-400 mt-0.5">
                  {[d.status, d.branch, d.assignedTo, d.createdAt && fmtDay(d.createdAt)].filter(Boolean).join(' · ')}
                </div>
                {d.cartItems && <div className="text-[10.5px] text-gray-500 mt-0.5 truncate">{d.cartItems}</div>}
              </button>
            ))}
          </div>
        )}
    </SectionCard>
  );
}

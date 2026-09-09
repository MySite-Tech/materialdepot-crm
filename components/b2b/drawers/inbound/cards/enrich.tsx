'use client';

import { InboundLead, LeadDeal, fmtINR } from '../../../models/mock-data';
import { Empty, SectionCard, Spinner } from '../../../ui/inbound-chips';

export function InboundEnrichCard({ deals, dealsLoading, draft }: {
  deals: LeadDeal[];
  dealsLoading: boolean;
  draft: InboundLead;
}) {
  return (
    <SectionCard
      title="Deal tickets"
      owner="deals"
      subtitle={`Every deal on ${draft.phone || 'this number'}`}
      right={!dealsLoading && <span className="text-[10px] font-semibold text-gray-400">{deals.length}</span>}
    >
      {dealsLoading ? <Spinner label="Loading deals…" />
        : deals.length === 0 ? <Empty>No deal tickets on this number yet — a PI or order raised in the main CRM will appear here.</Empty>
          : (
            <div className="flex flex-col divide-y divide-gray-100">
              {deals.map((d) => (
                <div key={d.ticketId ?? d.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-mono font-semibold text-gray-800 truncate">{d.id}</span>
                      {draft.enqId && d.id === draft.enqId && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#0F766E] bg-[#0F766E]/10 px-1.5 py-0.5 rounded">matched</span>
                      )}
                    </div>
                    <span className="text-[12px] font-mono text-gray-700 whitespace-nowrap">
                      {d.cartValue ? fmtINR(d.cartValue) : '—'}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {[d.status, d.branch, d.assignedTo, d.createdAt ? `Created ${d.createdAt}` : '']
                      .filter(Boolean).join(' · ')}
                  </div>
                  {d.lostReason && <div className="text-[10px] text-red-500 mt-0.5">Lost: {d.lostReason}</div>}
                </div>
              ))}
            </div>
          )}
    </SectionCard>
  );
}

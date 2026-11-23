'use client';

import { OrderSearchDeal } from '../../../../lib/api/ops/escalation';
import { cfDisplayValue, formatCurrency } from '../utils';

export function DealResults({ deals, onPick, selectedName }: {
  deals: OrderSearchDeal[];
  onPick: (deal: OrderSearchDeal) => void;
  selectedName: string | null;
}) {
  return (
    <div className="space-y-2">
      {deals.map((deal) => {
        const existingSupport = cfDisplayValue(deal.customFieldValues?.["cfRaiseSupportRequest"]);
        const existingEscalation = cfDisplayValue(deal.customFieldValues?.["cfRaiseEscalation"]);
        const contactName = deal.associatedContacts?.[0]?.name ?? "User";
    
        return (
          <div
            key={deal.leadId}
            onClick={() => onPick(deal)}
            className={`rounded-xl border border-gray-200 overflow-hidden cursor-pointer transition-colors ${
              selectedName === deal.name ? "bg-yellow-50/60 border-yellow-300" : "bg-white hover:bg-yellow-50/40"
            }`}
          >
            <div className="px-4 py-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{deal.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {contactName && <span className="text-yellow-700 font-medium">{contactName} · </span>}
                    {deal.ownedBy?.name ?? "—"} · {formatCurrency(deal.estimatedValue)}
                  </p>
                </div>
                <div className="ml-2 flex items-center gap-1.5">
                  {deal.pipelineStage?.name && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {deal.pipelineStage.name}
                    </span>
                  )}
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
              {(existingSupport || existingEscalation) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {existingSupport && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                      Support: {existingSupport}
                    </span>
                  )}
                  {existingEscalation && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                      Escalation: {existingEscalation}
                    </span>
                  )}
                </div>
              )}
            </div>
    
          </div>
        );
      })}
    </div>
  );
}

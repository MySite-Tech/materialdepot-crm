'use client';

import { Deal } from '../../../lib/types/index';
import { DEFAULT_PAGE_SIZE } from '../constants/raise';
import { cfDisplayValue, formatCurrency } from '../utils/raise';
import { Dispatch, SetStateAction } from 'react';

export function DealResults({ currentPage, dealContact, deals, goToPage, pageLoading, selectedDeal, setExpandedDealId, setSelectedDeal, totalCount, totalPages }: {
  currentPage: number;
  dealContact: Record<number, string>;
  deals: Deal[];
  getOngoing: (dealName: string) => { id: number; name: string; stage: string; pipeline: string; }[];
  goToPage: (page: number) => Promise<void>;
  pageLoading: boolean;
  selectedDeal: Deal | null;
  setExpandedDealId: Dispatch<SetStateAction<number | null>>;
  setSelectedDeal: Dispatch<SetStateAction<Deal | null>>;
  totalCount: number;
  totalPages: number;
}) {
  return (
    <div className="space-y-2">
      {deals.map((deal) => {
        const existingSupport = cfDisplayValue(deal.customFieldValues?.["cfRaiseSupportRequest"]);
        const existingEscalation = cfDisplayValue(deal.customFieldValues?.["cfRaiseEscalation"]);
        const contactName = dealContact[deal.id] ?? "User";
    
        return (
          <div
            key={deal.id}
            onClick={() => {
              setSelectedDeal(deal);
              setExpandedDealId(deal.id);
            }}
            className={`rounded-xl border border-gray-200 overflow-hidden cursor-pointer transition-colors ${
              selectedDeal?.id === deal.id ? "bg-yellow-50/60 border-yellow-300" : "bg-white hover:bg-yellow-50/40"
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 mt-3 px-1">
          <span className="text-xs text-gray-500">
            {currentPage * DEFAULT_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * DEFAULT_PAGE_SIZE, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={pageLoading || currentPage === 0}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40 active:bg-gray-50"
            >
              Prev
            </button>
            <span className="text-xs text-gray-600 px-2">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={pageLoading || currentPage >= totalPages - 1}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40 active:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

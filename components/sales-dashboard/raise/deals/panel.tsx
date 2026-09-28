'use client';

import { Deal } from '../../../../lib/types';
import { RAISE_OPTIONS } from '../constants';
import { EscSupportDeal } from '../types';
import { RaiseField } from '../ui/fields';
import { Dispatch, SetStateAction } from 'react';

export function DealPanel({ addNoteToTicket, expandedDealId, findSameIssue, getOngoing, handleSubmit, onViewDeal, selectedDeal, setSelectedDeal, submitError, submitSuccess, submitting }: {
  addNoteToTicket: (ticketId: number, text: string) => Promise<void>;
  expandedDealId: number | null;
  findSameIssue: (dealName: string, reasonId: number) => EscSupportDeal | undefined;
  getOngoing: (dealName: string) => EscSupportDeal[];
  handleSubmit: (dealId: number, selectedOptions: { id: number; name: string; requestType?: "Support" | "Escalation" | undefined; }[], notes?: string) => Promise<void>;
  onViewDeal: (dealName: string) => void;
  selectedDeal: Deal;
  setSelectedDeal: Dispatch<SetStateAction<Deal | null>>;
  submitError: string | null;
  submitSuccess: number | null;
  submitting: number | null;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[999] bg-black/40 sm:bg-black/20" onClick={() => setSelectedDeal(null)} />
      <div className="fixed inset-x-0 bottom-0 z-[1000] flex flex-col bg-white shadow-2xl max-h-[88vh] rounded-t-2xl animate-[slideUp_0.2s_ease-out] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-screen sm:max-h-none sm:w-[420px] sm:rounded-none sm:animate-[slideInRight_0.2s_ease-out]">
    
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
    
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-sm font-semibold text-gray-900 truncate">{selectedDeal.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedDeal.ownedBy?.name ?? "—"}
              {selectedDeal.pipelineStage?.name && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium">
                  {selectedDeal.pipelineStage.name}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setSelectedDeal(null)}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
    
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
    
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Ongoing Escalation/Support Requests
            </p>
            {getOngoing(selectedDeal.name).length > 0 ? (
              <ul className="space-y-1.5">
                {getOngoing(selectedDeal.name).map((ed) => (
                  <li
                    key={ed.id}
                    onClick={() => { onViewDeal(ed.name); setSelectedDeal(null); }}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer hover:opacity-80 ${
                      ed.pipeline === "escalation" ? "border-rose-100 bg-rose-50/50" : "border-teal-100 bg-teal-50/50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{ed.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">
                        RCA: {ed.rca || "—"} · Resolution: {ed.resolution || "—"}
                      </p>
                    </div>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                      ed.closed ? "bg-gray-100 text-gray-600"
                        : ed.pipeline === "escalation" ? "bg-rose-100 text-rose-700" : "bg-teal-100 text-teal-700"
                    }`}>{ed.closed ? `Closed · ${ed.stage}` : ed.stage}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">No ongoing requests.</p>
            )}
          </div>
    
          <div className="space-y-3">
            <RaiseField
              label="Raise Request"
              options={RAISE_OPTIONS}
              onSubmit={(opts, notes) => handleSubmit(selectedDeal.id, opts, notes)}
              findExisting={(reasonId) => findSameIssue(selectedDeal.name, reasonId)}
              onOpenExisting={(ticket) => { onViewDeal(ticket.name); setSelectedDeal(null); }}
              onAddNote={addNoteToTicket}
              succeeded={submitSuccess === selectedDeal.id}
              submitting={submitting === selectedDeal.id}
            />
          </div>
    
          {submitSuccess === selectedDeal.id && (
            <p className="text-xs text-green-600 font-medium">Escalation ticket created in Kylas</p>
          )}
          {/* No blanket "submit again" alongside this: a timed-out raise is
              usually still in flight, and inviting a resubmit is what raised
              duplicate tickets. Each message carries its own retry guidance. */}
          {submitError && submitting === null && expandedDealId === selectedDeal.id && (
            <p className="text-xs text-red-600">{submitError}</p>
          )}
        </div>
      </div>
    </>
  );
}

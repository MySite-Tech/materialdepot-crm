'use client';

import { CallLog, Deal } from '../../../lib/types/index';
import { TIMELINE_ICONS } from '../constants/escalation';
import { TimelineEntry } from '../types/escalation';
import { cfDisplayValue, outcomeStyle, relativeAge, relativeTimeBetween } from '../utils/escalation';
import { Dispatch, SetStateAction } from 'react';

export function EscalationDetail({ dealNotes, expandedCallLogs, loadingExpanded, raisedBy, selectedDeal, setSelectedDeal, timelineMap }: {
  dealNotes: { id: number; description: string; createdAt?: string | undefined; }[];
  expandedCallLogs: CallLog[];
  loadingExpanded: boolean;
  raisedBy: string | null;
  selectedDeal: Deal;
  setSelectedDeal: Dispatch<SetStateAction<Deal | null>>;
  timelineMap: Record<number, TimelineEntry[]>;
}) {
  return (
    <>
    
      <div
        className="fixed inset-0 z-[999] bg-black/40 sm:bg-black/20"
        onClick={() => setSelectedDeal(null)}
      />
    
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
          {loadingExpanded ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
    
              <div className="rounded-lg bg-yellow-50 border border-yellow-100 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-700 mb-2">Resolution Details</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-gray-500 w-20 shrink-0">Raised by</span>
                    <span className="font-medium text-gray-800">{raisedBy || "—"}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-gray-500 w-20 shrink-0">Resolution</span>
                    <span className="font-medium text-gray-800">{cfDisplayValue(selectedDeal.customFieldValues?.["cfResolution"]) || "—"}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-gray-500 w-20 shrink-0">Refund/CN</span>
                    <span className="font-medium text-gray-800">{String(selectedDeal.customFieldValues?.["cfRefundCnAmount"] ?? "—")}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-gray-500 w-20 shrink-0">Attribution</span>
                    <span className="font-medium text-gray-800">{cfDisplayValue(selectedDeal.customFieldValues?.["cfEscalationClassification"]) || "—"}</span>
                  </div>
                </div>
              </div>
    
              {(timelineMap[selectedDeal.id] ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Timeline</p>
                  <div className="relative ml-3">
                    <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />
                    <ul className="space-y-3">
                      {(timelineMap[selectedDeal.id] ?? []).slice().reverse().map((t, i, arr) => {
                        const ic = TIMELINE_ICONS[t.icon];
                        const isLast = i === arr.length - 1;
                        const prevAt = i > 0 ? arr[i - 1].createdAt : null;
                        const gap = prevAt ? relativeTimeBetween(prevAt, t.createdAt) : null;
                        return (
                          <li key={t.id} className="relative flex items-start gap-3 pl-2">
                            <div className={`shrink-0 w-[18px] h-[18px] rounded-full ${isLast ? "bg-yellow-400 ring-2 ring-yellow-200" : ic.bg} flex items-center justify-center z-10`}>
                              <span className="text-white text-[9px] font-bold">{ic.symbol}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 leading-tight">{t.event}</p>
                              {t.description && <p className="text-[10px] text-gray-500">{t.description}</p>}
                              <p className="text-[10px] text-gray-400">{gap || relativeAge(t.createdAt)} · {t.performedBy}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
    
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes ({dealNotes.length})</p>
                {dealNotes.length === 0 ? (
                  <p className="text-xs text-gray-400">No notes found.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dealNotes.map((n) => (
                      <li key={n.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-800">{n.description}</p>
                        {n.createdAt && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {relativeAge(n.createdAt)} · {new Date(n.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
    
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Call Logs ({expandedCallLogs.length})</p>
                {expandedCallLogs.length === 0 ? (
                  <p className="text-xs text-gray-400">No call logs found.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {expandedCallLogs.map((log) => (
                      <li key={log.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-500">{log.callType?.toLowerCase() === "incoming" ? "↓ In" : "↑ Out"}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${outcomeStyle[log.outcome] ?? "bg-gray-100 text-gray-600"}`}>{log.outcome.replace(/_/g, " ")}</span>
                          </div>
                          <span className="text-[10px] text-gray-400">{relativeAge(log.startTime)}</span>
                        </div>
                        {log.owner?.name && <p className="text-[10px] text-gray-500 mt-0.5">{log.owner.name}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

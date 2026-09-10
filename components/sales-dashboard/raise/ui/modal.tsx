'use client';

import { KylasDealInfo, SyncEstimateResult } from '../../../../lib/api/ops/kylas-sync';
import { Dispatch, FormEvent, SetStateAction } from 'react';

export function RaiseModal({ handleFindKylasDeal, kylasDealInfo, kylasError, kylasInput, kylasLoading, kylasSyncResult, setKylasInput, setKylasModalOpen }: {
  handleFindKylasDeal: (e: FormEvent<Element>) => Promise<void>;
  kylasDealInfo: KylasDealInfo | null;
  kylasError: string | null;
  kylasInput: string;
  kylasLoading: boolean;
  kylasSyncResult: SyncEstimateResult | null;
  setKylasInput: Dispatch<SetStateAction<string>>;
  setKylasModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4"
      onClick={() => setKylasModalOpen(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
    
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Find Kylas Deal</p>
            <p className="text-xs text-gray-400 mt-0.5">Sync an estimate or cart to Kylas</p>
          </div>
          <button
            onClick={() => setKylasModalOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
    
        <div className="px-5 py-4 space-y-4">
          <form onSubmit={handleFindKylasDeal} className="flex gap-2">
            <input
              type="text"
              value={kylasInput}
              onChange={(e) => setKylasInput(e.target.value)}
              placeholder="e.g. ENQ2026043067368 or CT6F6100196349"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              autoFocus
            />
            <button
              type="submit"
              disabled={kylasLoading || !kylasInput.trim()}
              className="px-4 py-2.5 rounded-lg bg-gray-900 text-yellow-400 text-sm font-semibold disabled:opacity-40 shrink-0"
            >
              {kylasLoading ? "Syncing…" : "Sync"}
            </button>
          </form>
    
          <p className="text-[11px] text-gray-400">
            Enter a Lead ID (e.g. ENQ2026…) or Cart Number (e.g. CT…)
          </p>
    
          {kylasLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="w-4 h-4 animate-spin text-yellow-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Syncing with Kylas…
            </div>
          )}
    
          {kylasError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              {kylasError}
            </div>
          )}
    
          {kylasSyncResult?.queued && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
              Rate limited by Kylas — queued for retry.
            </div>
          )}
    
          {kylasSyncResult?.success && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
    
              <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-b border-green-100">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
                <p className="text-sm font-semibold text-green-800">Synced to Kylas</p>
                {kylasSyncResult.estimate_status && (
                  <span className="ml-auto text-xs text-green-600 font-medium">{kylasSyncResult.estimate_status}</span>
                )}
              </div>
    
              <div className="px-4 py-3 space-y-2.5">
                {kylasDealInfo ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900 truncate">{kylasDealInfo.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {kylasDealInfo.ownerName && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-700">
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                          </svg>
                          {kylasDealInfo.ownerName}
                        </span>
                      )}
                      {kylasDealInfo.pipelineName && (
                        <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-medium text-blue-700">
                          {kylasDealInfo.pipelineName}
                        </span>
                      )}
                      {kylasDealInfo.stageName && (
                        <span className="px-2.5 py-1 rounded-full bg-yellow-50 border border-yellow-200 text-xs font-medium text-yellow-700">
                          {kylasDealInfo.stageName}
                        </span>
                      )}
                    </div>
                    <a
                      href={`https://app.kylas.io/sales/deals/details/${kylasSyncResult.deal_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 font-medium hover:text-gray-900 transition-colors"
                    >
                      Open in Kylas
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                      </svg>
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Deal ID: {kylasSyncResult.deal_id}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { AssociatedDeal, ContactResult } from '../types/raise';
import { Dispatch, SetStateAction } from 'react';

export function ContactResults({ contactDeals, contacts, expandedContactId, fetchContactDeals, loadingContactDeals, loadingContacts, onViewDeal, setExpandedContactId, setExpandedDealId }: {
  contactDeals: AssociatedDeal[];
  contacts: ContactResult[];
  expandedContactId: number | null;
  fetchContactDeals: (contactId: number) => Promise<void>;
  loadingContactDeals: boolean;
  loadingContacts: boolean;
  onViewDeal: (dealName: string) => void;
  setExpandedContactId: Dispatch<SetStateAction<number | null>>;
  setExpandedDealId: Dispatch<SetStateAction<number | null>>;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contacts</p>
      {loadingContacts ? (
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
      ) : (
        <div className="space-y-1.5">
          {contacts.map((c) => {
            const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || `Contact #${c.id}`;
            const isExpanded = expandedContactId === c.id;
            return (
              <div key={c.id}>
                <button
                  onClick={() => {
                    if (isExpanded) { setExpandedContactId(null); return; }
                    setExpandedContactId(c.id);
                    fetchContactDeals(c.id);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    isExpanded
                      ? "bg-yellow-50 border-yellow-400 text-gray-900"
                      : "bg-white border-gray-200 text-gray-700 active:bg-gray-50"
                  }`}
                >
                  {name}
                  <span className="text-xs text-gray-400 ml-2">#{c.id}</span>
                </button>
    
                {isExpanded && (
                  <div className="ml-4 mt-1.5 space-y-1.5">
                    {loadingContactDeals ? (
                      <div className="h-8 rounded bg-gray-100 animate-pulse" />
                    ) : contactDeals.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No deals found.</p>
                    ) : (
                      contactDeals.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            if (d.pipeline === "sales") {
                              setExpandedContactId(null);
                              setExpandedDealId(d.id);
                            } else {
                              onViewDeal(d.name);
                            }
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 bg-white active:bg-gray-50"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-900 truncate flex-1">{d.name}</p>
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                              d.pipeline === "escalation"
                                ? "bg-rose-100 text-rose-700"
                                : d.pipeline === "support"
                                ? "bg-teal-100 text-teal-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {d.pipelineName}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{d.stage} · {d.estimatedValue}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

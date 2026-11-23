'use client';

import { makeRaiseActions } from './handlers';

import { DealPanel } from './deals/panel';
import { DealResults } from './deals/results';
import { SearchForm } from './search/form';

import { EscSupportDeal, Props, RaiseProgress } from './types';
import { OrderSearchDeal, searchOrderDeals } from '@/lib/api';
import { useRef, useState } from 'react';

export default function MobileRaiseClient({ onViewDeal, userName }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [searched, setSearched] = useState("");
  const [deals, setDeals] = useState<OrderSearchDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<OrderSearchDeal | null>(null);

  const [escSupportDeals, setEscSupportDeals] = useState<EscSupportDeal[]>([]);

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [raises, setRaises] = useState<RaiseProgress[]>([]);

  const submitLockRef = useRef(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { addNoteToTicket, findSameIssue, getOngoing, handleSubmit, retryRaise } = makeRaiseActions({ escSupportDeals, setDeals, setRaises, setEscSupportDeals, setSelectedDeal, setSubmitError, setSubmitSuccess, setSubmitting, submitLockRef });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (q.length < 3) {
      setError("Type at least 3 characters — ENQ id or phone number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchOrderDeals(q);
      setDeals(data.content ?? []);
      setEscSupportDeals(data.tickets ?? []);
      setSearched(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function pickDeal(deal: OrderSearchDeal) {
    setSubmitError(null);
    setRaises((prev) => prev.filter((r) => !(r.leadId === deal.leadId && r.status === "failed")));
    setSelectedDeal(deal);
    setExpandedDealId(deal.leadId);
  }

  return (
    <div>

      <SearchForm
        handleSearch={handleSearch}
        inputValue={inputValue}
        loading={loading}
        setInputValue={setInputValue}
      />

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : !searched ? (
        <div className="mt-2 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-yellow-50">
            <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Find the order to raise an escalation on</p>
          <p className="mt-1 text-sm text-gray-500">
            Search by ENQ id or customer phone number.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            {["ENQ20261123105648", "9876543210"].map((ex) => (
              <span key={ex} className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">e.g. {ex}</span>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-400">Orders from Payment Pending onwards show up here.</p>
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-gray-900">No order found for &ldquo;{searched}&rdquo;</p>
          <p className="mt-1 text-sm text-gray-500">
            Escalations can only be raised on orders that are Payment Pending or later.
          </p>
          <ul className="mx-auto mt-3 max-w-sm space-y-1 text-left text-xs text-gray-500">
            <li>• Check the ENQ id or phone number for typos.</li>
            <li>• Quotes and carts that haven&apos;t reached Payment Pending won&apos;t show here.</li>
            <li>• Try another number the customer uses.</li>
          </ul>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Ordered Deals ({deals.length})
          </p>
          <DealResults
            deals={deals}
            onPick={pickDeal}
            selectedName={selectedDeal?.name ?? null}
          />
        </>
      )}

      {selectedDeal && (
        <DealPanel
        expandedDealId={expandedDealId}
        addNoteToTicket={(ticketId, text) => addNoteToTicket(ticketId, text, userName)}
        findSameIssue={findSameIssue}
        getOngoing={getOngoing}
        handleSubmit={handleSubmit}
        raises={raises.filter((r) => r.leadId === selectedDeal.leadId)}
        retryRaise={retryRaise}
        onViewDeal={onViewDeal}
        selectedDeal={selectedDeal}
        setSelectedDeal={setSelectedDeal}
        submitError={submitError}
        submitSuccess={submitSuccess}
        submitting={submitting}
      />
      )}
    </div>
  );
}

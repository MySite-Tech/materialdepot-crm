'use client';

import { makeRaiseActions } from './handlers';

import { ContactResults } from './contact-results';
import { DealPanel } from './deal-panel';
import { DealResults } from './deal-results';
import { RaiseModal } from './raise-modal';
import { SearchForm } from './search-form';

import { DEFAULT_PAGE_SIZE, PAGE_SIZE, RAISE_OPTIONS, SALES_PIPELINE_RULE, SEARCH_FIELDS, SYNC_INDEX_DELAY_MS, SYNC_INDEX_MAX_ATTEMPTS } from '../constants/raise';
import { RaiseField } from './fields';
import { AssociatedDeal, ContactResult, Props } from '../types/raise';
import { cfDisplayValue, extractEscSupport, formatCurrency, friendlyPatchError, isSalesDeal } from '../utils/raise';
import { KylasDealInfo, SyncEstimateResult, fetchKylasDealInfo, syncEstimate } from '@/lib/mockApi';
import { Deal, DealsSearchResponse } from '@/lib/types/index';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function MobileRaiseClient({ userName, onViewDeal }: Props) {
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [expandedContactId, setExpandedContactId] = useState<number | null>(null);
  const [contactDeals, setContactDeals] = useState<AssociatedDeal[]>([]);
  const [loadingContactDeals, setLoadingContactDeals] = useState(false);

  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dealContact, setDealContact] = useState<Record<number, string>>({});

  const [escSupportDeals, setEscSupportDeals] = useState<
    { id: number; name: string; stage: string; pipeline: string }[]
  >([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [defaultRange, setDefaultRange] = useState<{ from: string; to: string } | null>(null);

  const [submitting, setSubmitting] = useState<number | null>(null);

  const submitLockRef = useRef(false);
  const [submitSuccess, setSubmitSuccess] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [kylasModalOpen, setKylasModalOpen] = useState(false);
  const [kylasInput, setKylasInput] = useState("");
  const [kylasLoading, setKylasLoading] = useState(false);
  const [kylasSyncResult, setKylasSyncResult] = useState<SyncEstimateResult | null>(null);
  const [kylasDealInfo, setKylasDealInfo] = useState<KylasDealInfo | null>(null);
  const [kylasError, setKylasError] = useState<string | null>(null);

  const [autoSyncing, setAutoSyncing] = useState(false);
  const [autoSyncError, setAutoSyncError] = useState<string | null>(null);
  const autoSyncAttempted = useRef<Set<string>>(new Set());

  const fetchDeals = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      let allSales: Deal[] = [];

      if (q.trim()) {

        const res = await fetch(
          `/api/deals/search?page=0&size=${PAGE_SIZE}&sort=${encodeURIComponent("updatedAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: SEARCH_FIELDS,
              jsonRule: {
                condition: "AND",
                rules: [{
                  id: "multi_field", field: "multi_field", type: "multi_field",
                  input: "multi_field", operator: "multi_field",
                  value: q.trim(),
                }],
                valid: true,
              },
            }),
            cache: "no-store",
          }
        );
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: DealsSearchResponse = await res.json();
        const all = data.content ?? [];
        allSales = all.filter(isSalesDeal);

        const upper = q.trim().toUpperCase();
        const exact = allSales.filter((d) => d.name.toUpperCase() === upper);
        const partial = allSales.filter((d) => d.name.toUpperCase().includes(upper));
        allSales = exact.length > 0 ? exact : partial.length > 0 ? partial : allSales;

        setEscSupportDeals(extractEscSupport(all));
        setTotalPages(0);
        setTotalCount(0);
        setCurrentPage(0);
        setDefaultRange(null);
      } else {

        const now = new Date();
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
        const fromIso = sevenDaysAgo.toISOString();
        const toIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        const res = await fetch(
          `/api/deals/search?page=0&size=${DEFAULT_PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: SEARCH_FIELDS,
              jsonRule: {
                condition: "AND",
                rules: [
                  { id: "createdAt", field: "createdAt", type: "date", input: "date",
                    operator: "between", value: [fromIso, toIso] },
                  SALES_PIPELINE_RULE,
                ],
                valid: true,
              },
            }),
            cache: "no-store",
          }
        );
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: DealsSearchResponse = await res.json();
        const content = data.content ?? [];
        allSales = content.filter(isSalesDeal);

        setEscSupportDeals([]);
        setTotalPages(data.totalPages ?? 0);
        setTotalCount(data.totalElements ?? content.length);
        setCurrentPage(0);
        setDefaultRange({ from: fromIso, to: toIso });
      }

      setDeals(allSales);
      setLoading(false);

      loadBackgroundData(allSales);
      return allSales;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      return null;
    }
  }, []);

  const { fetchContactDeals, getOngoing, goToPage, handleFindKylasDeal, handleOpenKylasModal, handleSubmit, loadBackgroundData, searchContacts } = makeRaiseActions({ defaultRange, escSupportDeals, kylasInput, pageLoading, setContactDeals, setContacts, setCurrentPage, setDealContact, setDeals, setKylasDealInfo, setKylasError, setKylasInput, setKylasLoading, setKylasModalOpen, setKylasSyncResult, setLoadingContactDeals, setLoadingContacts, setPageLoading, setSelectedDeal, setSubmitError, setSubmitSuccess, setSubmitting, setTotalCount, setTotalPages, submitLockRef, totalCount, totalPages });


  useEffect(() => { fetchDeals(""); }, [fetchDeals]);

  useEffect(() => {
    if (!selectedDeal) return;
    const base = selectedDeal.name.match(/((?:ENQ|MD|CT)\w+)/i)?.[1];
    if (!base) return;

    if (escSupportDeals.some((d) => d.name.toUpperCase().includes(base.toUpperCase()))) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/deals/search?page=0&size=50&sort=${encodeURIComponent("updatedAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: ["name", "pipeline", "pipelineStage", "id"],
              jsonRule: {
                condition: "AND",
                rules: [{
                  id: "multi_field", field: "multi_field", type: "multi_field",
                  input: "multi_field", operator: "multi_field", value: base,
                }],
                valid: true,
              },
            }),
            cache: "no-store",
          }
        );
        if (!res.ok || cancelled) return;
        const data: DealsSearchResponse = await res.json();
        const found = extractEscSupport(data.content ?? []);
        if (cancelled || found.length === 0) return;
        setEscSupportDeals((prev) => {
          const seen = new Set(prev.map((d) => d.id));
          return [...prev, ...found.filter((d) => !seen.has(d.id))];
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [selectedDeal?.id]);

  function isSyncableId(q: string) {
    return /^CT\w+$/i.test(q) || /^(?:ENQ|MD)\w+$/i.test(q);
  }

  async function autoSyncMissingDeal(q: string) {
    const key = q.toUpperCase();

    autoSyncAttempted.current.delete(key);
    setAutoSyncing(true);
    setAutoSyncError(null);
    try {
      const result = await syncEstimate(q);
      if (result.success) {
        autoSyncAttempted.current.add(key);

        for (let i = 0; i < SYNC_INDEX_MAX_ATTEMPTS; i++) {
          await new Promise((resolve) => setTimeout(resolve, SYNC_INDEX_DELAY_MS));
          const found = await fetchDeals(q);
          if (found && found.length > 0) return;
        }
        setAutoSyncError(
          "Deal created in Kylas, but it hasn't appeared in search yet. Search again in a moment."
        );
      } else if (result.queued) {
        setAutoSyncError("Rate limited by Kylas — queued for retry. Search again in a moment.");
      } else {
        setAutoSyncError(
          `${result.message ?? result.error ?? "Could not create this deal in Kylas."} — search again to retry.`
        );
      }
    } catch (err) {
      setAutoSyncError(
        `${err instanceof Error ? err.message : "Could not reach Kylas."} — search again to retry.`
      );
    } finally {
      setAutoSyncing(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    setQuery(inputValue);
    setContacts([]);
    setExpandedContactId(null);
    setAutoSyncError(null);
    if (/^\d{10}$/.test(q)) {
      searchContacts(inputValue);
    } else {
      setContacts([]);
    }
    const found = await fetchDeals(inputValue);
    if (
      found?.length === 0 &&
      isSyncableId(q) &&
      !autoSyncAttempted.current.has(q.toUpperCase())
    ) {
      autoSyncMissingDeal(q);
    }
  }

  function handleExpandDeal(deal: Deal) {
    setExpandedDealId(expandedDealId === deal.id ? null : deal.id);
  }

  return (
    <div>

      <SearchForm
        handleOpenKylasModal={handleOpenKylasModal}
        handleSearch={handleSearch}
        inputValue={inputValue}
        loading={loading}
        setInputValue={setInputValue}
      />

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {(contacts.length > 0 || loadingContacts) && (
        <ContactResults
        contactDeals={contactDeals}
        contacts={contacts}
        expandedContactId={expandedContactId}
        fetchContactDeals={fetchContactDeals}
        loadingContactDeals={loadingContactDeals}
        loadingContacts={loadingContacts}
        onViewDeal={onViewDeal}
        setExpandedContactId={setExpandedContactId}
        setExpandedDealId={setExpandedDealId}
      />
      )}

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Sales Deals {!loading && `(${deals.length})`}
      </p>

      {autoSyncing ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <svg className="w-4 h-4 animate-spin text-yellow-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          syncing from Kylas…
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="py-10 space-y-2">
          <p className="text-center text-sm text-gray-400">No sales deals found.</p>
          {autoSyncError && (
            <p className="text-center text-sm text-red-600 px-4">{autoSyncError}</p>
          )}
        </div>
      ) : (
        <DealResults
        currentPage={currentPage}
        dealContact={dealContact}
        deals={deals}
        getOngoing={getOngoing}
        goToPage={goToPage}
        pageLoading={pageLoading}
        selectedDeal={selectedDeal}
        setExpandedDealId={setExpandedDealId}
        setSelectedDeal={setSelectedDeal}
        totalCount={totalCount}
        totalPages={totalPages}
      />
      )}

      {kylasModalOpen && (
        <RaiseModal
        handleFindKylasDeal={handleFindKylasDeal}
        kylasDealInfo={kylasDealInfo}
        kylasError={kylasError}
        kylasInput={kylasInput}
        kylasLoading={kylasLoading}
        kylasSyncResult={kylasSyncResult}
        setKylasInput={setKylasInput}
        setKylasModalOpen={setKylasModalOpen}
      />
      )}

      {selectedDeal && (
        <DealPanel
        expandedDealId={expandedDealId}
        getOngoing={getOngoing}
        handleSubmit={handleSubmit}
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

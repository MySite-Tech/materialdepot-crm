"use client";

import { useState, useEffect, useCallback } from "react";
import type { Deal, DealsSearchResponse } from "@/lib/types";
import { syncEstimate, fetchKylasDealInfo, type SyncEstimateResult, type KylasDealInfo } from "@/lib/mockApi";

const PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 10;
const SALES_PIPELINE_ID = 31661;

const SALES_PIPELINE_RULE = {
  id: "pipeline", field: "pipeline", type: "string", input: "select",
  operator: "equal", value: SALES_PIPELINE_ID,
};

const SEARCH_FIELDS = [
  "name", "ownedBy", "estimatedValue", "pipeline", "pipelineStage",
  "id", "createdAt", "updatedAt", "customFieldValues", "associatedContacts",
];

// Single "Raise Request" field (single-select). Every value routes through
// cfRaiseEscalation (Escalation pipeline); `requestType` is the auto-mapped
// Request Type written to cfRequestType on submit (system-set, per the brief).
//
// These 13 values come from the redefined "Raise request" field in Kylas.
const RAISE_OPTIONS: { id: number; name: string; requestType: "Support" | "Escalation" }[] = [
  { id: 202380, name: "Return Request", requestType: "Support" },
  { id: 202381, name: "Change in lead time", requestType: "Support" },
  { id: 184695, name: "Modify Order", requestType: "Support" },
  { id: 202382, name: "Order status update", requestType: "Support" },
  { id: 202383, name: "Delivery Attempted", requestType: "Support" },
  { id: 184512, name: "Others", requestType: "Support" },
  { id: 184504, name: "Delivery Delay", requestType: "Escalation" },
  { id: 202384, name: "Items missing/Incorrect Quantity", requestType: "Escalation" },
  { id: 184507, name: "Wrong material", requestType: "Escalation" },
  { id: 184505, name: "Damaged Material", requestType: "Escalation" },
  { id: 202385, name: "Unloading not done", requestType: "Escalation" },
  { id: 184506, name: "Quality issue", requestType: "Escalation" },
  { id: 202386, name: "Installation/Site Audit Issue", requestType: "Escalation" },
];

function isSalesDeal(deal: Deal) {
  return (deal.pipeline?.name ?? "").toLowerCase().includes("sales");
}

function extractEscSupport(deals: Deal[]) {
  const seen = new Set<number>();
  const out: { id: number; name: string; stage: string; pipeline: string }[] = [];
  for (const d of deals) {
    const p = (d.pipeline?.name ?? "").toLowerCase();
    if (!p.includes("escalation") && !p.includes("support")) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({
      id: d.id,
      name: d.name,
      stage: d.pipelineStage?.name ?? "—",
      pipeline: p.includes("escalation") ? "escalation" : "support",
    });
  }
  return out;
}

function formatCurrency(val: Deal["estimatedValue"]) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val.value);
}

function cfDisplayValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val))
    return val.map((v) => (v as { name?: string })?.name ?? String(v)).join(", ");
  if (typeof val === "object" && (val as { name?: string }).name)
    return (val as { name: string }).name;
  return String(val);
}

interface ContactResult {
  id: number;
  firstName?: string;
  lastName?: string;
}

interface AssociatedDeal {
  id: number;
  name: string;
  pipeline: string;
  pipelineName: string;
  stage: string;
  estimatedValue: string;
}

interface Props {
  userName?: string;
  onViewDeal: (dealName: string) => void;
}

export default function MobileRaiseClient({ userName, onViewDeal }: Props) {
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contact search results
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Expanded contact → associated deals
  const [expandedContactId, setExpandedContactId] = useState<number | null>(null);
  const [contactDeals, setContactDeals] = useState<AssociatedDeal[]>([]);
  const [loadingContactDeals, setLoadingContactDeals] = useState(false);

  // Expanded deal for raise form
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dealContact, setDealContact] = useState<Record<number, string>>({});

  // All escalation+support deals for history matching
  const [escSupportDeals, setEscSupportDeals] = useState<
    { id: number; name: string; stage: string; pipeline: string }[]
  >([]);

  // Pagination (default mode only)
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [defaultRange, setDefaultRange] = useState<{ from: string; to: string } | null>(null);

  const [submitting, setSubmitting] = useState<number | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Find Kylas Deal modal
  const [kylasModalOpen, setKylasModalOpen] = useState(false);
  const [kylasInput, setKylasInput] = useState("");
  const [kylasLoading, setKylasLoading] = useState(false);
  const [kylasSyncResult, setKylasSyncResult] = useState<SyncEstimateResult | null>(null);
  const [kylasDealInfo, setKylasDealInfo] = useState<KylasDealInfo | null>(null);
  const [kylasError, setKylasError] = useState<string | null>(null);

  // Fetch sales deals

  const fetchDeals = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      let allSales: Deal[] = [];

      if (q.trim()) {
        // Search mode: use multi_field to search across ALL sales deals
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
        // Client-side partial match refinement
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
        // Default: last 7 days by createdAt — fetch only first page, expose Load More
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
        // Don't pre-extract escalation/support — loaded lazily when a deal sidebar opens
        setEscSupportDeals([]);
        setTotalPages(data.totalPages ?? 0);
        setTotalCount(data.totalElements ?? content.length);
        setCurrentPage(0);
        setDefaultRange({ from: fromIso, to: toIso });
      }

      setDeals(allSales);
      setLoading(false);

      // Background: contact names only
      loadBackgroundData(allSales);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }, []);

  async function goToPage(page: number) {
    if (!defaultRange || pageLoading || page < 0 || (totalPages > 0 && page >= totalPages)) return;
    setPageLoading(true);
    try {
      const res = await fetch(
        `/api/deals/search?page=${page}&size=${DEFAULT_PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: SEARCH_FIELDS,
            jsonRule: {
              condition: "AND",
              rules: [
                { id: "createdAt", field: "createdAt", type: "date", input: "date",
                  operator: "between", value: [defaultRange.from, defaultRange.to] },
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
      const pageSales = content.filter(isSalesDeal);
      setDeals(pageSales);
      setCurrentPage(page);
      setTotalPages(data.totalPages ?? totalPages);
      setTotalCount(data.totalElements ?? totalCount);
      loadBackgroundData(pageSales);
    } catch { /* ignore */ }
    finally { setPageLoading(false); }
  }

  function loadBackgroundData(filtered: Deal[]) {
    // Contact names come from the search response (`associatedContacts` field).
    // No per-deal fetch — if a deal genuinely has no associated contact, just don't show one.
    const inline: Record<number, string> = {};
    for (const d of filtered) {
      const c = (d as Deal & { associatedContacts?: { name: string }[] }).associatedContacts?.[0];
      if (c?.name) inline[d.id] = c.name;
    }
    if (Object.keys(inline).length > 0) {
      setDealContact((prev) => ({ ...prev, ...inline }));
    }
  }

  // Search contacts
  async function searchContacts(q: string) {
    if (!q.trim()) { setContacts([]); return; }
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/contacts/search?page=0&size=10`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: ["firstName", "lastName", "id"],
          jsonRule: {
            condition: "AND",
            rules: [{
              id: "multi_field", field: "multi_field", type: "multi_field",
              input: "multi_field", operator: "multi_field", value: q.trim(),
            }],
            valid: true,
          },
        }),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.content ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoadingContacts(false); }
  }

  // Fetch all deals for a contact
  async function fetchContactDeals(contactId: number) {
    setLoadingContactDeals(true);
    setContactDeals([]);
    try {
      // Fetch recent deals across all pipelines and check which ones share this contact
      const res = await fetch(
        `/api/deals/search?page=0&size=200&sort=${encodeURIComponent("updatedAt,desc")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: SEARCH_FIELDS,
            jsonRule: {
              condition: "AND",
              rules: [{
                id: "createdAt", field: "createdAt", type: "date", input: "date",
                operator: "between",
                value: [
                  new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
                  new Date().toISOString(),
                ],
              }],
              valid: true,
            },
          }),
          cache: "no-store",
        }
      );
      if (!res.ok) return;
      const data: DealsSearchResponse = await res.json();
      const matched: AssociatedDeal[] = [];
      const all = data.content ?? [];
      const BATCH = 8;
      outer: for (let i = 0; i < all.length; i += BATCH) {
        const batch = all.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(async (d) => {
          try {
            const dr = await fetch(`/api/deals/${d.id}`, { cache: "no-store" });
            if (!dr.ok) return null;
            const dd = await dr.json();
            if (!dd.associatedContacts?.some((c: { id: number }) => c.id === contactId)) return null;
            const pName = (d.pipeline?.name ?? "").toLowerCase();
            return {
              id: d.id,
              name: d.name,
              pipeline: pName.includes("escalation") ? "escalation" : pName.includes("support") ? "support" : "sales",
              pipelineName: d.pipeline?.name ?? "—",
              stage: d.pipelineStage?.name ?? "—",
              estimatedValue: formatCurrency(d.estimatedValue),
            } as AssociatedDeal;
          } catch { return null; }
        }));
        for (const r of results) {
          if (r) matched.push(r);
          if (matched.length >= 20) break outer;
        }
      }
      setContactDeals(matched);
    } catch { /* ignore */ }
    finally { setLoadingContactDeals(false); }
  }

  function getOngoing(dealName: string) {
    const base = dealName.match(/((?:ENQ|MD|CT)\w+)/i)?.[1]?.toUpperCase();
    if (!base) return [];
    return escSupportDeals.filter((d) => d.name.toUpperCase().includes(base));
  }

  async function handleSubmit(
    dealId: number,
    selectedOptions: { id: number; name: string; requestType?: "Support" | "Escalation" }[]
  ) {
    setSubmitting(dealId);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const field = "cfRaiseEscalation";
      // Auto-mapped Request Type: Escalation wins if any selected value is an escalation.
      const requestType = selectedOptions.some((o) => o.requestType === "Escalation")
        ? "Escalation"
        : "Support";

      async function patchDeal(ops: unknown[]) {
        const res = await fetch(`/api/deals/${dealId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ops),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Failed: ${res.status}`);
        }
      }

      const currentDeal = deals.find((d) => d.id === dealId) ?? selectedDeal;
      const existing = currentDeal?.customFieldValues?.[field];
      const existingArr = Array.isArray(existing)
        ? (existing as { id: number; name: string }[])
        : [];

      const activeIds = new Set(RAISE_OPTIONS.map((o) => o.id));
      const removeIndices = existingArr
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => !activeIds.has(e.id) || selectedOptions.some((o) => o.id === e.id))
        .map(({ i }) => i)
        .sort((a, b) => b - a);
      if (removeIndices.length > 0) {
        await patchDeal(
          removeIndices.map((i) => ({ op: "remove", path: `/customFieldValues/${field}/${i}` }))
        );
      }

      const patchOps = [
        ...(existingArr.length > 0 ? [] : [{ op: "add", path: `/customFieldValues/${field}`, value: [] }]),
        ...selectedOptions.map((opt) => ({
          op: "add" as const,
          path: `/customFieldValues/${field}/-`,
          value: { id: opt.id, name: opt.name },
        })),
        { op: "add" as const, path: `/customFieldValues/cfRequestType`, value: requestType },
      ];
      await patchDeal(patchOps);

      const mergedValue = [
        ...existingArr.filter((e) => activeIds.has(e.id) && !selectedOptions.some((o) => o.id === e.id)),
        ...selectedOptions.map((o) => ({ id: o.id, name: o.name })),
      ];
      setSubmitSuccess(dealId);
      setTimeout(() => setSubmitSuccess(null), 3000);
      // Patch local state — avoid re-running the full fetch flow
      setDeals((prev) => prev.map((d) => d.id === dealId
        ? { ...d, customFieldValues: { ...(d.customFieldValues ?? {}), [field]: mergedValue } }
        : d
      ));
      setSelectedDeal((prev) => prev && prev.id === dealId
        ? { ...prev, customFieldValues: { ...(prev.customFieldValues ?? {}), [field]: mergedValue } }
        : prev
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleFindKylasDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!kylasInput.trim()) return;
    setKylasLoading(true);
    setKylasError(null);
    setKylasSyncResult(null);
    setKylasDealInfo(null);
    try {
      const result = await syncEstimate(kylasInput.trim());
      setKylasSyncResult(result);
      if (result.success && result.deal_id) {
        const info = await fetchKylasDealInfo(result.deal_id);
        setKylasDealInfo(info);
      } else if (!result.success) {
        setKylasError(result.message ?? result.error ?? "Sync failed");
      }
    } catch (err) {
      setKylasError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setKylasLoading(false);
    }
  }

  function handleOpenKylasModal() {
    setKylasModalOpen(true);
    setKylasInput("");
    setKylasError(null);
    setKylasSyncResult(null);
    setKylasDealInfo(null);
  }

  useEffect(() => { fetchDeals(""); }, [fetchDeals]);

  // Lazy-load escalation/support for the opened deal
  useEffect(() => {
    if (!selectedDeal) return;
    const base = selectedDeal.name.match(/((?:ENQ|MD|CT)\w+)/i)?.[1];
    if (!base) return;
    // Skip if we already have entries for this base name (e.g. from search-mode load)
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(inputValue);
    setContacts([]);
    setExpandedContactId(null);
    fetchDeals(inputValue);
    if (/^\d{10}$/.test(inputValue.trim())) {
      searchContacts(inputValue);
    } else {
      setContacts([]);
    }
  }

  function handleExpandDeal(deal: Deal) {
    setExpandedDealId(expandedDealId === deal.id ? null : deal.id);
  }

  return (
    <div>
      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search by contact or deal…"
          className="w-full sm:flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-[#EAB308] text-gray-950 text-sm font-semibold disabled:opacity-50"
          >
            Search
          </button>
          <button
            type="button"
            onClick={handleOpenKylasModal}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-gray-900 text-yellow-400 text-sm font-semibold whitespace-nowrap"
          >
            Find Kylas Deal
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Contact results */}
      {(contacts.length > 0 || loadingContacts) && (
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
      )}

      {/* Sales deals */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Sales Deals {!loading && `(${deals.length})`}
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">No sales deals found.</p>
      ) : (
        <div className="space-y-2">
          {deals.map((deal) => {
            const escDeals = getOngoing(deal.name);
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
      )}

      {/* Find Kylas Deal modal */}
      {kylasModalOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setKylasModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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

            {/* Body */}
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
                  {/* Success banner */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-b border-green-100">
                    <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    <p className="text-sm font-semibold text-green-800">Synced to Kylas</p>
                    {kylasSyncResult.estimate_status && (
                      <span className="ml-auto text-xs text-green-600 font-medium">{kylasSyncResult.estimate_status}</span>
                    )}
                  </div>

                  {/* Deal info */}
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
      )}

      {/* Detail sidebar */}
      {selectedDeal && (
        <>
          <div className="fixed inset-0 z-[999] bg-black/40 sm:bg-black/20" onClick={() => setSelectedDeal(null)} />
          <div className="fixed inset-x-0 bottom-0 z-[1000] flex flex-col bg-white shadow-2xl max-h-[88vh] rounded-t-2xl animate-[slideUp_0.2s_ease-out] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-screen sm:max-h-none sm:w-[420px] sm:rounded-none sm:animate-[slideInRight_0.2s_ease-out]">
            {/* Mobile grabber */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            {/* Header */}
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

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Ongoing requests */}
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
                        <p className="text-xs font-medium text-gray-900 truncate flex-1">{ed.name}</p>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                          ed.pipeline === "escalation" ? "bg-rose-100 text-rose-700" : "bg-teal-100 text-teal-700"
                        }`}>{ed.stage}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400">No ongoing requests.</p>
                )}
              </div>

              {/* Raise form — single field, always routes to the Escalation pipeline */}
              <div className="space-y-3">
                <RaiseField
                  label="Raise Request"
                  options={RAISE_OPTIONS}
                  onSubmit={(opts) => handleSubmit(selectedDeal.id, opts)}
                  submitting={submitting === selectedDeal.id}
                />
              </div>

              {submitSuccess === selectedDeal.id && (
                <p className="text-xs text-green-600 font-medium">Updated in CRM</p>
              )}
              {submitError && submitting === null && expandedDealId === selectedDeal.id && (
                <p className="text-xs text-red-600">{submitError}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RaiseField({
  label,
  options,
  onSubmit,
  submitting,
}: {
  label: string;
  options: { id: number; name: string; requestType?: "Support" | "Escalation" }[];
  onSubmit: (opts: { id: number; name: string; requestType?: "Support" | "Escalation" }[]) => void;
  submitting: boolean;
}) {
  // Single-select per the brief — one value per "Raise request". Selection is
  // tracked by index since PENDING options share id 0.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selectedOption = selectedIdx === null ? null : options[selectedIdx];
  const isPending = selectedOption?.id === 0;

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {options.map((o, i) => (
          <button
            key={`${o.id}-${i}`}
            type="button"
            disabled={submitting}
            onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 ${
              selectedIdx === i
                ? "bg-gray-950 text-yellow-400 border-gray-950"
                : "bg-white text-gray-700 border-gray-300 active:bg-gray-100"
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>
      {selectedOption && (
        <button
          onClick={() => { if (!isPending) onSubmit([selectedOption]); }}
          disabled={submitting || isPending}
          className="w-full py-2 rounded-lg bg-yellow-400 text-gray-950 text-sm font-bold disabled:opacity-50"
        >
          {isPending ? "Pending Kylas ID" : submitting ? "Submitting…" : "Submit"}
        </button>
      )}
    </div>
  );
}

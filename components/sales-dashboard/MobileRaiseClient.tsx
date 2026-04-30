"use client";

import { useState, useEffect, useCallback } from "react";
import type { Deal, DealsSearchResponse } from "@/lib/types";

const PAGE_SIZE = 200;

const SEARCH_FIELDS = [
  "name", "ownedBy", "estimatedValue", "pipeline", "pipelineStage",
  "id", "createdAt", "updatedAt", "customFieldValues",
];

const SUPPORT_OPTIONS = [
  { id: 184499, name: "Change delivery date" },
  { id: 184696, name: "Need Order tracking details" },
  { id: 184503, name: "Others" },
  { id: 184500, name: "Update delivery address" },
  { id: 184694, name: "Add/Remove Express&Unloading" },
  { id: 184692, name: "Schedule Installation" },
  { id: 189779, name: "Send tax invoice" },
];

const ESCALATION_OPTIONS = [
  { id: 184504, name: "Delivery delay" },
  { id: 184505, name: "Damaged material" },
  { id: 184506, name: "Quality Issue" },
  { id: 184507, name: "Wrong material" },
  { id: 184508, name: "Item missing" },
  { id: 184509, name: "Installation Issue" },
  { id: 184510, name: "Return/Exchange Request" },
  { id: 184512, name: "Other disputes" },
  { id: 184693, name: "Order cancellation" },
  { id: 184695, name: "Modify Order" },
];

function isSalesDeal(deal: Deal) {
  return (deal.pipeline?.name ?? "").toLowerCase().includes("sales");
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

  const [submitting, setSubmitting] = useState<number | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        allSales = (data.content ?? []).filter(isSalesDeal);
        // Client-side partial match refinement
        const upper = q.trim().toUpperCase();
        const exact = allSales.filter((d) => d.name.toUpperCase() === upper);
        const partial = allSales.filter((d) => d.name.toUpperCase().includes(upper));
        allSales = exact.length > 0 ? exact : partial.length > 0 ? partial : allSales;
      } else {
        // Default: last 7 days by createdAt
        const now = new Date();
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
        const fromIso = sevenDaysAgo.toISOString();
        const toIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        const collected: Deal[] = [];
        let page = 0;
        while (true) {
          const res = await fetch(
            `/api/deals/search?page=${page}&size=${PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fields: SEARCH_FIELDS,
                jsonRule: {
                  condition: "AND",
                  rules: [{
                    id: "createdAt", field: "createdAt", type: "date", input: "date",
                    operator: "between", value: [fromIso, toIso],
                  }],
                  valid: true,
                },
              }),
              cache: "no-store",
            }
          );
          if (!res.ok) throw new Error(`Request failed: ${res.status}`);
          const data: DealsSearchResponse = await res.json();
          collected.push(...(data.content ?? []));
          page += 1;
          if (page >= (data.totalPages ?? 0) || (data.content ?? []).length === 0) break;
        }
        allSales = collected.filter(isSalesDeal);
      }

      setDeals(allSales);
      setLoading(false);

      // Background: contacts + esc history (non-blocking)
      loadBackgroundData(allSales);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }, []);

  async function loadBackgroundData(filtered: Deal[]) {
    // Contacts for top 15 deals
    const targets = filtered.slice(0, 15);
    const contactNames: Record<number, string> = {};
    for (const d of targets) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const dr = await fetch(`/api/deals/${d.id}`, { cache: "no-store" });
        if (dr.status === 429) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        if (dr.ok) {
          const dd = await dr.json();
          const c = dd.associatedContacts?.[0];
          if (c) {
            contactNames[d.id] = c.name;
            setDealContact((prev) => ({ ...prev, [d.id]: c.name }));
          }
        }
      } catch { /* skip */ }
    }

    // Esc/support history — fetch escalation + support pipeline deals separately
    try {
      const FINAL_STAGES = ["closed cancelled", "closed invalid", "escalation won"];
      const allActive: typeof escSupportDeals = [];

      for (const searchTerm of ["Escalation", "Support"]) {
        const escRes = await fetch(
          `/api/deals/search?page=0&size=500&sort=${encodeURIComponent("createdAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: ["name", "pipeline", "pipelineStage", "id"],
              jsonRule: {
                condition: "AND",
                rules: [{
                  id: "multi_field", field: "multi_field", type: "multi_field",
                  input: "multi_field", operator: "multi_field",
                  value: searchTerm,
                }],
                valid: true,
              },
            }),
            cache: "no-store",
          }
        );
        if (escRes.ok) {
          const escData: DealsSearchResponse = await escRes.json();
          for (const d of escData.content ?? []) {
            const p = (d.pipeline?.name ?? "").toLowerCase();
            if (!p.includes("escalation") && !p.includes("support")) continue;
            const s = (d.pipelineStage?.name ?? "").toLowerCase().trim();
            if (FINAL_STAGES.some((f) => s === f || s.startsWith("closed"))) continue;
            allActive.push({
              id: d.id,
              name: d.name,
              stage: d.pipelineStage?.name ?? "—",
              pipeline: p.includes("escalation") ? "escalation" : "support",
            });
          }
        }
      }

      // Deduplicate by id
      const seen = new Set<number>();
      const deduped = allActive.filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
      setEscSupportDeals(deduped);

    } catch { /* ignore */ }
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
      for (const d of data.content ?? []) {
        try {
          const dr = await fetch(`/api/deals/${d.id}`, { cache: "no-store" });
          if (!dr.ok) continue;
          const dd = await dr.json();
          if (dd.associatedContacts?.some((c: { id: number }) => c.id === contactId)) {
            const pName = (d.pipeline?.name ?? "").toLowerCase();
            matched.push({
              id: d.id,
              name: d.name,
              pipeline: pName.includes("escalation") ? "escalation" : pName.includes("support") ? "support" : "sales",
              pipelineName: d.pipeline?.name ?? "—",
              stage: d.pipelineStage?.name ?? "—",
              estimatedValue: formatCurrency(d.estimatedValue),
            });
          }
        } catch { /* skip */ }
        if (matched.length >= 20) break;
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
    type: "support" | "escalation",
    selectedOptions: { id: number; name: string }[]
  ) {
    setSubmitting(dealId);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const field = type === "support" ? "cfRaiseSupportRequest" : "cfRaiseEscalation";
      const patchOps = [
        { op: "add", path: `/customFieldValues/${field}`, value: [] },
        ...selectedOptions.map((opt, i) => ({
          op: "add" as const,
          path: `/customFieldValues/${field}/${i}`,
          value: { id: opt.id, name: opt.name },
        })),
      ];
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchOps),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed: ${res.status}`);
      }
      setSubmitSuccess(dealId);
      setTimeout(() => setSubmitSuccess(null), 3000);
      fetchDeals(query);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSubmitting(null);
    }
  }

  useEffect(() => { fetchDeals(""); }, [fetchDeals]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(inputValue);
    setContacts([]);
    setExpandedContactId(null);
    fetchDeals(inputValue);
    searchContacts(inputValue);
  }

  function handleExpandDeal(deal: Deal) {
    setExpandedDealId(expandedDealId === deal.id ? null : deal.id);
  }

  return (
    <div>
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search by contact or deal…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 rounded-lg bg-[#EAB308] text-gray-950 text-sm font-semibold disabled:opacity-50"
        >
          Search
        </button>
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
            const contactName = dealContact[deal.id];

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
        </div>
      )}

      {/* Detail sidebar */}
      {selectedDeal && (
        <>
          <div className="fixed inset-0 z-[999] bg-black/20" onClick={() => setSelectedDeal(null)} />
          <div className="fixed top-0 right-0 h-screen w-[420px] max-w-full z-[1000] bg-white shadow-2xl flex flex-col">
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

              {/* Raise forms */}
              <div className="space-y-3">
                <RaiseField
                  label="Raise Support Request"
                  options={SUPPORT_OPTIONS}
                  onSubmit={(opts) => handleSubmit(selectedDeal.id, "support", opts)}
                  submitting={submitting === selectedDeal.id}
                />
                <RaiseField
                  label="Raise Escalation"
                  options={ESCALATION_OPTIONS}
                  onSubmit={(opts) => handleSubmit(selectedDeal.id, "escalation", opts)}
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
  options: { id: number; name: string }[];
  onSubmit: (opts: { id: number; name: string }[]) => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={submitting}
            onClick={() => toggle(o.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 ${
              selected.has(o.id)
                ? "bg-gray-950 text-yellow-400 border-gray-950"
                : "bg-white text-gray-700 border-gray-300 active:bg-gray-100"
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <button
          onClick={() => {
            const opts = options.filter((o) => selected.has(o.id));
            if (opts.length > 0) onSubmit(opts);
          }}
          disabled={submitting}
          className="w-full py-2 rounded-lg bg-yellow-400 text-gray-950 text-sm font-bold disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      )}
    </div>
  );
}

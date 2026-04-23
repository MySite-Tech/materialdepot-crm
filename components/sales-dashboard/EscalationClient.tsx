"use client";

import { useState, useEffect, useCallback } from "react";
import type { Deal, DealsSearchResponse, CallLog } from "@/lib/types";
import DealDetailPanel from "./DealDetailPanel";

const PAGE_SIZE = 500;

const SEARCH_FIELDS = [
  "name",
  "ownedBy",
  "estimatedValue",
  "pipeline",
  "pipelineStage",
  "id",
  "createdAt",
  "updatedAt",
  "customFieldValues",
];

function buildBody(query: string, fromIso: string, toIso: string) {
  const rules: unknown[] = [
    {
      id: "createdAt",
      field: "createdAt",
      type: "date",
      input: "date",
      operator: "between",
      value: [fromIso, toIso],
    },
  ];
  if (query.trim()) {
    rules.push({
      id: "multi_field",
      field: "multi_field",
      type: "multi_field",
      input: "multi_field",
      operator: "multi_field",
      value: query.trim(),
    });
  }
  return {
    fields: SEARCH_FIELDS,
    jsonRule: { condition: "AND", rules, valid: true },
  };
}

type Preset = "today" | "yesterday" | "current_week" | "current_month";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "current_week", label: "Current week" },
  { value: "current_month", label: "Current month" },
];

function toLocalDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(input: string) {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(input: string) {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  switch (p) {
    case "today":
      return { from: toLocalDateInput(today), to: toLocalDateInput(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: toLocalDateInput(y), to: toLocalDateInput(y) };
    }
    case "current_week": {
      const dow = today.getDay();
      const offset = dow === 0 ? -6 : 1 - dow;
      const monday = addDays(today, offset);
      return { from: toLocalDateInput(monday), to: toLocalDateInput(today) };
    }
    case "current_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toLocalDateInput(first), to: toLocalDateInput(today) };
    }
  }
}

function detectPreset(from: string, to: string): Preset | "" {
  for (const { value } of PRESETS) {
    const r = presetRange(value);
    if (r.from === from && r.to === to) return value;
  }
  return "";
}

function isEscalationDeal(deal: Deal) {
  return deal.pipeline?.name?.toLowerCase().includes("escalation") ?? false;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(val: Deal["estimatedValue"]) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val.value);
}

function cfDisplayValue(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "string") return val || "—";
  if (Array.isArray(val))
    return val.map((v) => (v as { name?: string })?.name ?? String(v)).join(", ") || "—";
  if (typeof val === "object" && (val as { name?: string }).name)
    return (val as { name: string }).name;
  return String(val);
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function normalizePhone(p: string | null | undefined) {
  return (p ?? "").replace(/\D/g, "");
}

function relationMatches(call: CallLog, contactId: number, leadIds: number[]): boolean {
  const rels = call.relatedTo ?? [];
  return rels.some(
    (r) =>
      (r.entity === "contact" && r.id === contactId) ||
      (r.entity === "lead" && leadIds.includes(r.id))
  );
}

function phoneMatches(call: CallLog, phones: string[]): boolean {
  if (phones.length === 0) return false;
  const candidates = [call.phoneNumber, call.originator, call.receiver]
    .map(normalizePhone)
    .filter((s) => s.length >= 7);
  if (candidates.length === 0) return false;
  return candidates.some((c) =>
    phones.some((p) => {
      // Match if either ends with the other's last 10 digits (handles +91 etc.)
      const a = c.slice(-10);
      const b = p.slice(-10);
      return a === b;
    })
  );
}

// Outcome badge
const outcomeStyle: Record<string, string> = {
  connected: "bg-green-100 text-green-700",
  missed_call: "bg-red-100 text-red-700",
  not_connected: "bg-gray-100 text-gray-600",
  voicemail: "bg-yellow-100 text-yellow-700",
};

interface NoteEntry {
  description: string;
  createdAt?: string;
}

export default function EscalationClient() {
  const today = toLocalDateInput(new Date());
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  // Latest incoming + outgoing call per deal
  const [callLogMap, setCallLogMap] = useState<
    Record<number, { incoming: CallLog | null; outgoing: CallLog | null }>
  >({});
  // Latest note per deal
  const [noteMap, setNoteMap] = useState<Record<number, NoteEntry | null>>({});
  // Associated contact per deal
  const [contactMap, setContactMap] = useState<Record<number, { id: number; name: string } | null>>({});
  // Which deal rows have their latest note expanded
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  const fetchDeals = useCallback(
    async (searchQuery: string, fromStr: string, toStr: string) => {
      setLoading(true);
      setError(null);
      setCallLogMap({});
      setNoteMap({});
      setContactMap({});
      const fromIso = startOfDay(fromStr).toISOString();
      const toIso = endOfDay(toStr).toISOString();
      try {
        const collected: Deal[] = [];
        let page = 0;
        while (true) {
          const res = await fetch(
            `/api/deals/search?page=${page}&size=${PAGE_SIZE}&sort=${encodeURIComponent("updatedAt,desc")}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildBody(searchQuery, fromIso, toIso)),
              cache: "no-store",
            }
          );
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error ?? `Request failed: ${res.status}`);
          }
          const data: DealsSearchResponse = await res.json();
          collected.push(...(data.content ?? []));
          const totalPages = data.totalPages ?? 0;
          page += 1;
          if (page >= totalPages || (data.content ?? []).length === 0) break;
        }
        const filtered = collected.filter(isEscalationDeal);
        setDeals(filtered);
        setTotalElements(filtered.length);
        return filtered;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Run async tasks with bounded concurrency so we don't burst past Kylas rate limits.
  async function pool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i]);
      }
    });
    await Promise.all(runners);
    return out;
  }

  // Global request pacer — ensures minimum gap between requests to stay under Kylas rate limit.
  const lastRequestRef = { current: 0 };
  async function fetchJson(url: string): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Enforce minimum 250ms gap between requests
      const now = Date.now();
      const wait = Math.max(0, lastRequestRef.current + 250 - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestRef.current = Date.now();

      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      return res.json();
    }
    return null;
  }

  // After deals load, batch-fetch contacts → call logs + notes per deal, throttled.
  const fetchInlineData = useCallback(async (dealList: Deal[]) => {
    if (dealList.length === 0) return;
    // Only enrich the first N rows (those visible) — Kylas rate-limits at ~5 req/s.
    const targets = dealList.slice(0, 50);

    const dealDetails = await pool(targets, 2, async (deal) => {
      const d = (await fetchJson(`/api/deals/${deal.id}`)) as
        | { associatedContacts?: { id: number; name: string }[]; ownedBy?: { id: number } | null }
        | null;
      return {
        dealId: deal.id,
        contactId: d?.associatedContacts?.[0]?.id ?? null,
        contactName: d?.associatedContacts?.[0]?.name ?? null,
        ownerId: d?.ownedBy?.id ?? deal.ownedBy?.id ?? null,
      };
    });

    const newContactMap: Record<number, { id: number; name: string } | null> = {};
    for (const { dealId, contactId, contactName } of dealDetails) {
      newContactMap[dealId] = contactId && contactName ? { id: contactId, name: contactName } : null;
    }
    setContactMap(newContactMap);

    // Kylas /call-logs ignores relatedToId — fetch each contact's phone, then match calls by number.
    const uniqueContactIds = Array.from(
      new Set(dealDetails.map((d) => d.contactId).filter((v): v is number => v != null))
    );
    const contactInfo = await pool(uniqueContactIds, 2, async (contactId) => {
      const c = (await fetchJson(`/api/contacts/${contactId}`)) as
        | {
            phoneNumbers?: { value?: string; dialCode?: string }[];
            convertedLeads?: { id: number }[];
          }
        | null;
      const phones = (c?.phoneNumbers ?? [])
        .map((p) => normalizePhone(`${p.dialCode ?? ""}${p.value ?? ""}`))
        .filter((p) => p.length >= 7);
      const leadIds = (c?.convertedLeads ?? []).map((l) => l.id);
      return { contactId, phones, leadIds };
    });
    const phonesByContact = new Map<number, string[]>();
    const leadsByContact = new Map<number, number[]>();
    for (const { contactId, phones, leadIds } of contactInfo) {
      phonesByContact.set(contactId, phones);
      leadsByContact.set(contactId, leadIds);
    }

    // Kylas /call-logs ignores filter params but pagination works — 3 pages ≈ 24h of call history.
    const CALL_PAGES = 3;
    const callPages = await pool(
      Array.from({ length: CALL_PAGES }, (_, i) => i + 1),
      1,
      async (pg) => {
        const r = (await fetchJson(`/api/call-logs?size=500&page=${pg}`)) as
          | { content?: CallLog[] }
          | null;
        return r?.content ?? [];
      }
    );
    const allCalls = callPages.flat().sort(
      (a, b) =>
        new Date(b.startTime ?? b.createdAt).getTime() -
        new Date(a.startTime ?? a.createdAt).getTime()
    );

    const newCallLogMap: Record<number, { incoming: CallLog | null; outgoing: CallLog | null }> = {};
    for (const { dealId, contactId } of dealDetails) {
      if (!contactId) {
        newCallLogMap[dealId] = { incoming: null, outgoing: null };
        continue;
      }
      const phones = phonesByContact.get(contactId) ?? [];
      const leadIds = leadsByContact.get(contactId) ?? [];
      const matches = allCalls.filter(
        (c) => phoneMatches(c, phones) || relationMatches(c, contactId, leadIds)
      );
      newCallLogMap[dealId] = {
        incoming: matches.find((c) => c.callType?.toLowerCase() === "incoming") ?? null,
        outgoing: matches.find((c) => c.callType?.toLowerCase() === "outgoing") ?? null,
      };
    }
    setCallLogMap(newCallLogMap);

    const noteResults = await pool(dealDetails, 2, async ({ dealId, ownerId }) => {
      const params = new URLSearchParams({
        targetEntityId: String(dealId),
        targetEntityType: "DEAL",
        sort: "createdAt,desc",
        page: "0",
        size: "1",
      });
      if (ownerId) params.set("targetEntityOwnerId", String(ownerId));
      const d = (await fetchJson(`/api/notes/relation?${params.toString()}`)) as
        | { content?: { description?: string; createdAt?: string | number }[] }
        | null;
      const n = d?.content?.[0];
      return {
        id: dealId,
        note: n
          ? {
              description: stripHtml(n.description ?? ""),
              createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt,
            }
          : null,
      };
    });
    const newNoteMap: Record<number, NoteEntry | null> = {};
    for (const { id, note } of noteResults) newNoteMap[id] = note;
    setNoteMap(newNoteMap);
  }, []);

  useEffect(() => {
    fetchDeals(query, from, to).then((deals) => fetchInlineData(deals));
  }, [fetchDeals, fetchInlineData, query, from, to]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(inputValue);
  }

  function handleClear() {
    setInputValue("");
    setQuery("");
  }

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Filter by enquiry no., stage, owner…"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Loading…" : "Search"}
        </button>
        <button
          type="button"
          onClick={async () => {
            const refreshed = await fetchDeals(query, from, to);
            fetchInlineData(refreshed);
          }}
          disabled={loading}
          title="Refresh from Kylas"
          className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </form>

      {/* Date filter */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Quick range
          </label>
          <select
            value={detectPreset(from, to)}
            onChange={(e) => {
              const v = e.target.value as Preset | "";
              if (!v) return;
              const r = presetRange(v);
              setFrom(r.from);
              setTo(r.to);
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Custom</option>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result count */}
      {!loading && !error && (
        <p className="text-xs text-gray-500 mb-3">
          {totalElements} escalation deal{totalElements !== 1 ? "s" : ""} created{" "}
          {from === to ? `on ${from}` : `${from} → ${to}`}
          {query ? ` matching "${query}"` : ""}
        </p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && deals.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Deal Name</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Resolution</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">
                  Last Updated
                  <span className="ml-1 text-indigo-400">↓</span>
                </th>
                <th className="px-4 py-3">Latest Incoming</th>
                <th className="px-4 py-3">Latest Outgoing</th>
                <th className="px-4 py-3">Latest Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {deals.map((deal) => {
                const calls = callLogMap[deal.id];
                const note = noteMap[deal.id];
                const logLoading = !(deal.id in callLogMap);
                const incoming = calls?.incoming ?? null;
                const outgoing = calls?.outgoing ?? null;

                return (
                  <tr
                    key={deal.id}
                    onClick={() => setSelectedDeal(deal)}
                    className={`cursor-pointer transition-colors hover:bg-indigo-50 ${
                      selectedDeal?.id === deal.id ? "bg-indigo-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{deal.name}</div>
                      <div className="text-xs text-gray-500">
                        {contactMap[deal.id]?.name ? (
                          <span>{contactMap[deal.id]!.name}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                        <span className="text-gray-300"> · #{deal.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {deal.pipelineStage?.name ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                          {deal.pipelineStage.name}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {deal.ownedBy?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {cfDisplayValue(deal.customFieldValues?.["cfResolution"])}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDateTime(deal.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-medium text-gray-800">
                        {formatDateTime(deal.updatedAt)}
                      </span>
                    </td>

                    {/* Latest incoming */}
                    <td className="px-4 py-3">
                      {logLoading ? (
                        <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                      ) : incoming ? (
                        <CallCell log={incoming} />
                      ) : (
                        <span className="text-xs text-gray-400">No incoming</span>
                      )}
                    </td>

                    {/* Latest outgoing */}
                    <td className="px-4 py-3">
                      {logLoading ? (
                        <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                      ) : outgoing ? (
                        <CallCell log={outgoing} />
                      ) : (
                        <span className="text-xs text-gray-400">No outgoing</span>
                      )}
                    </td>

                    {/* Latest note */}
                    <td className="px-4 py-3 max-w-xs">
                      {note ? (
                        <div>
                          <p
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedNotes((prev) => {
                                const next = new Set(prev);
                                if (next.has(deal.id)) next.delete(deal.id);
                                else next.add(deal.id);
                                return next;
                              });
                            }}
                            className={`text-xs text-gray-700 cursor-pointer hover:text-indigo-600 ${
                              expandedNotes.has(deal.id) ? "whitespace-pre-wrap" : "line-clamp-2"
                            }`}
                            title={expandedNotes.has(deal.id) ? "Click to collapse" : "Click to expand"}
                          >
                            {note.description}
                          </p>
                          {note.createdAt && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(note.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && deals.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No escalation deals found.
        </div>
      )}


      {/* Detail panel */}
      {selectedDeal && (
        <DealDetailPanel
          dealId={selectedDeal.id}
          dealName={selectedDeal.name}
          onClose={() => setSelectedDeal(null)}
        />
      )}
    </div>
  );
}

function CallCell({ log }: { log: CallLog }) {
  return (
    <div>
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
          outcomeStyle[log.outcome] ?? "bg-gray-100 text-gray-600"
        }`}
      >
        {log.outcome.replace(/_/g, " ")}
      </span>
      <div className="text-xs text-gray-400 mt-0.5">
        {new Date(log.startTime).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

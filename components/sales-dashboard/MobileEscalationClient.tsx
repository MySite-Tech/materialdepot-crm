"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Deal, DealsSearchResponse, CallLog } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants & helpers (same logic as EscalationClient)
// ---------------------------------------------------------------------------

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

function buildBody(query: string, fromIso: string | null, toIso: string | null) {
  const rules: unknown[] = [];
  if (fromIso && toIso) {
    rules.push({
      id: "createdAt",
      field: "createdAt",
      type: "date",
      input: "date",
      operator: "between",
      value: [fromIso, toIso],
    });
  }
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
  // Need at least one rule for Kylas
  if (rules.length === 0) {
    rules.push({
      id: "multi_field",
      field: "multi_field",
      type: "multi_field",
      input: "multi_field",
      operator: "multi_field",
      value: "Escalation",
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

function detectPreset(from: string, to: string): Preset | "all" | "" {
  if (!from && !to) return "all";
  for (const { value } of PRESETS) {
    const r = presetRange(value);
    if (r.from === from && r.to === to) return value;
  }
  return "";
}

function isEscalationOrSupport(deal: Deal) {
  const p = (deal.pipeline?.name ?? "").toLowerCase();
  return p.includes("escalation") || p.includes("support");
}

function isEscalationPipeline(deal: Deal) {
  return (deal.pipeline?.name ?? "").toLowerCase().includes("escalation");
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cfDisplayValue(val: unknown): string {
  if (val == null) return "\u2014";
  if (typeof val === "string") return val || "\u2014";
  if (Array.isArray(val))
    return (
      val
        .map((v) => (v as { name?: string })?.name ?? String(v))
        .join(", ") || "\u2014"
    );
  if (typeof val === "object" && (val as { name?: string }).name)
    return (val as { name: string }).name;
  return String(val);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function normalizePhone(p: string | null | undefined) {
  return (p ?? "").replace(/\D/g, "");
}

function relationMatches(
  call: CallLog,
  contactId: number,
  leadIds: number[]
): boolean {
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
      const a = c.slice(-10);
      const b = p.slice(-10);
      return a === b;
    })
  );
}

interface TimelineEntry {
  id: number;
  event: string;
  description: string;
  performedBy: string;
  createdAt: string;
  icon: "update" | "stage" | "note" | "call" | "create" | "close";
}

const TRACKED_FIELDS: Record<string, string> = {
  cfResolution: "Resolution",
  cfRefundCnAmount: "Refund/CN Value",
  cfEscalationClassification: "Attribution",
};

function isTrackedField(key: string) {
  return key in TRACKED_FIELDS || /csat|score/i.test(key);
}

function fieldLabel(key: string) {
  return TRACKED_FIELDS[key] ?? key.replace(/^cf/, "").replace(/([A-Z])/g, " $1").trim();
}

function formatFieldValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "object" && "name" in (val as Record<string, unknown>))
    return (val as { name: string }).name;
  if (Array.isArray(val))
    return (val as { name?: string }[]).map((v) => v.name ?? "").filter(Boolean).join(", ");
  return String(val);
}

function extractCallOutcome(performedBy: string): string | null {
  const m = performedBy.match(/(?:Task|Flow)\s*-\s*(.+)/i);
  if (!m) return null;
  const outcome = m[1].trim();
  if (/connected/i.test(outcome)) return "Connected";
  if (/rnr/i.test(outcome)) return "RNR";
  if (/pending/i.test(outcome)) return "Pending Info";
  return outcome;
}

function parseTimeline(feeds: { id: number; action?: { event?: string; name?: string; associatedEntity?: { entity?: string; name?: string } }; payload?: { old?: Record<string, unknown>; new?: Record<string, unknown> }; performedBy?: { name?: string }; createdAt?: string }[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const f of feeds) {
    const event = f.action?.event ?? "";
    const by = f.performedBy?.name ?? "System";
    const at = f.createdAt ?? "";
    const newP = f.payload?.new ?? {};
    const oldP = f.payload?.old ?? {};

    if (event === "CREATED") {
      entries.push({ id: f.id, event: "Created", description: "", performedBy: by, createdAt: at, icon: "create" });
    } else if (event === "PIPELINE_CHANGED") {
      const to = (newP.pipelineStage as { name?: string })?.name ?? "Unknown";
      const callOutcome = extractCallOutcome(by);
      const label = callOutcome ? `${to} (${callOutcome})` : to;
      entries.push({ id: f.id, event: label, description: "", performedBy: by, createdAt: at, icon: "stage" });
    } else if (event === "DEAL_CLOSED") {
      entries.push({ id: f.id, event: "Closed", description: "", performedBy: by, createdAt: at, icon: "close" });
    } else if (event === "TASK_COMPLETED") {
      const callOutcome = extractCallOutcome(by);
      if (callOutcome) {
        entries.push({ id: f.id, event: callOutcome, description: "", performedBy: by, createdAt: at, icon: "call" });
      }
    } else if (event === "ASSOCIATED_ENTITY_CREATED") {
      const entity = f.action?.associatedEntity?.entity;
      if (entity === "NOTE") {
        const desc = (newP.description as string) ?? "";
        const short = desc.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
        entries.push({ id: f.id, event: "Note", description: short.length > 40 ? short.slice(0, 40) + "\u2026" : short, performedBy: by, createdAt: at, icon: "note" });
      }
    } else if (event === "UPDATED") {
      const changes: string[] = [];
      for (const key of Object.keys(newP)) {
        if (!isTrackedField(key)) continue;
        const display = formatFieldValue(newP[key]);
        if (display) changes.push(`${fieldLabel(key)}: ${display}`);
      }
      if (changes.length > 0) {
        entries.push({ id: f.id, event: changes.join(" · "), description: "", performedBy: by, createdAt: at, icon: "update" });
      }
    }
  }
  return entries;
}

const TIMELINE_ICONS: Record<TimelineEntry["icon"], { bg: string; symbol: string }> = {
  create: { bg: "bg-blue-500", symbol: "+" },
  stage: { bg: "bg-indigo-500", symbol: "\u2192" },
  update: { bg: "bg-yellow-500", symbol: "\u270e" },
  note: { bg: "bg-green-500", symbol: "\u2709" },
  call: { bg: "bg-purple-500", symbol: "\u2706" },
  close: { bg: "bg-gray-500", symbol: "\u00d7" },
};

// Outcome badge styles
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

// ---------------------------------------------------------------------------
// Filter chip types
// ---------------------------------------------------------------------------

type DateFilter = "today" | "yesterday" | "7days" | "month" | "all";
type StatusFilter = "all" | "open" | "waiting" | "resolved";

const DATE_CHIPS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

function dateFilterRange(f: DateFilter): { from: string; to: string } {
  if (f === "all") return { from: "", to: "" };
  if (f === "today") return presetRange("today");
  if (f === "yesterday") return presetRange("yesterday");
  if (f === "month") return presetRange("current_month");
  // 7 days
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  return { from: toLocalDateInput(weekAgo), to: toLocalDateInput(today) };
}

function dateFilterLabel(f: DateFilter): string {
  switch (f) {
    case "today": return "today";
    case "yesterday": return "yesterday";
    case "7days": return "past 7 days";
    case "month": return "this month";
    case "all": return "all time";
  }
}

function classifyStage(stageName: string): StatusFilter {
  const s = stageName.toLowerCase();
  if (/resolved|won|completed|closed/.test(s)) return "resolved";
  if (/awaiting|dependency/.test(s)) return "waiting";
  if (/progress|new/.test(s)) return "open";
  return "open"; // default to open for unclassified
}

function relativeAge(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
}

function relativeTimeBetween(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m later`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m later` : `${hrs}h later`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days}d ${remHrs}h later` : `${days}d later`;
}

function cardBorderColor(deal: Deal): string {
  const stage = classifyStage(deal.pipelineStage?.name ?? "");
  switch (stage) {
    case "resolved": return "border-l-green-500";
    case "waiting": return "border-l-amber-400";
    case "open": {
      const s = (deal.pipelineStage?.name ?? "").toLowerCase();
      if (/new/.test(s)) return "border-l-gray-300";
      return "border-l-yellow-400";
    }
    default: return "border-l-gray-300";
  }
}

function stagePillStyle(deal: Deal): string {
  const stage = classifyStage(deal.pipelineStage?.name ?? "");
  switch (stage) {
    case "resolved": return "bg-green-600 text-white";
    case "waiting": return "bg-amber-100 text-amber-700";
    case "open": {
      const s = (deal.pipelineStage?.name ?? "").toLowerCase();
      if (/new/.test(s)) return "bg-gray-200 text-gray-600";
      return "bg-gray-950 text-yellow-400";
    }
    default: return "bg-gray-200 text-gray-600";
  }
}

// ---------------------------------------------------------------------------
// Mobile Escalation Client
// ---------------------------------------------------------------------------

interface MobileEscalationProps {
  jumpToSearch?: string | null;
  userName?: string;
}

export default function MobileEscalationClient({ jumpToSearch, userName }: MobileEscalationProps) {
  const today = toLocalDateInput(new Date());
  const hasJump = !!jumpToSearch;
  const [query, setQuery] = useState(hasJump ? jumpToSearch : "");
  const [inputValue, setInputValue] = useState(hasJump ? jumpToSearch : "");
  const [from, setFrom] = useState(hasJump ? "" : today);
  const [to, setTo] = useState(hasJump ? "" : today);
  const [exactMode, setExactMode] = useState(hasJump);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);
  const [expandedCallLogs, setExpandedCallLogs] = useState<CallLog[]>([]);
  const [dealNotes, setDealNotes] = useState<{ id: number; description: string; createdAt?: string }[]>([]);
  const [timelineMap, setTimelineMap] = useState<Record<number, TimelineEntry[]>>({});
  const [loadingExpanded, setLoadingExpanded] = useState(false);

  // Add note / upload doc state
  const [noteTargetDeal, setNoteTargetDeal] = useState<number | null>(null);
  const [uploadTargetDeal, setUploadTargetDeal] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Track last action per deal for preview
  const [lastAction, setLastAction] = useState<Record<number, { type: "note" | "doc"; text: string }>>({});

  const [callLogMap, setCallLogMap] = useState<
    Record<number, { incoming: CallLog | null; outgoing: CallLog | null }>
  >({});
  const [noteMap, setNoteMap] = useState<Record<number, NoteEntry | null>>({});
  const [contactMap, setContactMap] = useState<
    Record<number, { id: number; name: string } | null>
  >({});

  // New UI state
  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>(hasJump ? "all" : "today");
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>("all");

  // ---- Data fetching (identical logic to EscalationClient) ----

  const fetchDeals = useCallback(
    async (searchQuery: string, fromStr: string, toStr: string) => {
      setLoading(true);
      setError(null);
      setCallLogMap({});
      setNoteMap({});
      setContactMap({});
      const fromIso = fromStr ? startOfDay(fromStr).toISOString() : null;
      const toIso = toStr ? endOfDay(toStr).toISOString() : null;
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
        let filtered = collected.filter(isEscalationOrSupport);
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toUpperCase();
          if (exactMode) {
            filtered = filtered.filter((d) => d.name.toUpperCase() === q);
          } else {
            filtered = filtered.filter((d) => d.name.toUpperCase().includes(q));
          }
        }
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

  async function pool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>
  ): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) return;
          out[i] = await worker(items[i]);
        }
      }
    );
    await Promise.all(runners);
    return out;
  }

  async function fetchJson(url: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      if (!res.ok) return null;
      return res.json();
    }
    return null;
  }

  // Only fetch timelines on load — everything else on expand
  const fetchTimelines = useCallback(async (dealList: Deal[]) => {
    if (dealList.length === 0) return;
    for (const deal of dealList.slice(0, 15)) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch(`/api/feeds/search?page=0&size=50&sort=performedAt%2Cdesc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonRule: { condition: "AND", rules: [
              { field: "related_to", operator: "equal", id: "related_to", type: "related_lookup", value: { entity: "deal", id: String(deal.id) } },
              { field: "systemDefault", operator: "equal", id: "systemDefault", type: "boolean", value: false },
              { field: "category", operator: "equal", id: "category", type: "string", value: "ALL" },
            ], valid: true },
          }),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setTimelineMap((prev) => ({ ...prev, [deal.id]: parseTimeline(data.content ?? []) }));
        }
      } catch { /* skip */ }
    }
    // After timelines, fetch contacts for first 15 deals
    for (const deal of dealList.slice(0, 15)) {
      if (contactMap[deal.id] !== undefined) continue;
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch(`/api/deals/${deal.id}`, { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          const c = d.associatedContacts?.[0];
          setContactMap((prev) => ({ ...prev, [deal.id]: c ? { id: c.id, name: c.name } : null }));
        }
      } catch { /* skip */ }
    }
  }, []);

  const fetchKeyRef = useRef("");

  useEffect(() => {
    const key = `${query}|${from}|${to}`;
    if (fetchKeyRef.current === key) return;
    fetchKeyRef.current = key;
    fetchDeals(query, from, to).then((deals) => fetchTimelines(deals));
  }, [fetchDeals, fetchTimelines, query, from, to]);


  async function pacedFetch(url: string, options?: RequestInit): Promise<Response | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
      try {
        const res = await fetch(url, { cache: "no-store", ...options });
        if (res.status === 429) continue;
        return res;
      } catch { return null; }
    }
    return null;
  }

  async function handleExpandDeal(dealId: number) {
    if (expandedDealId === dealId) {
      setExpandedDealId(null);
      return;
    }
    setExpandedDealId(dealId);
    setLoadingExpanded(true);
    setExpandedCallLogs([]);
    setDealNotes([]);

    try {
      // Phase 1: deal detail + notes (show resolution immediately)
      const detailRes = await pacedFetch(`/api/deals/${dealId}`);
      const detail = detailRes?.ok ? await detailRes.json() : null;
      if (!detail) { setLoadingExpanded(false); return; }

      const contactId = detail.associatedContacts?.[0]?.id;
      const ownerId = detail.ownedBy?.id;

      const noteParams = new URLSearchParams({
        targetEntityId: String(dealId),
        targetEntityType: "DEAL",
        sort: "createdAt,desc",
        page: "0",
        size: "20",
      });
      if (ownerId) noteParams.set("targetEntityOwnerId", String(ownerId));
      const notesRes = await pacedFetch(`/api/notes/relation?${noteParams}`);
      const notesData = notesRes?.ok ? await notesRes.json() : { content: [] };
      setDealNotes(
        (notesData.content ?? []).map((n: { id: number; description?: string; createdAt?: string | number }) => ({
          id: n.id,
          description: (n.description ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
          createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt,
        }))
      );

      // Phase 1 done — show resolution + notes immediately
      setLoadingExpanded(false);

      // Phase 2: timeline + call logs (load in background, UI updates progressively)
      if (!timelineMap[dealId]) {
        try {
          const feedsRes = await pacedFetch(
            `/api/feeds/search?page=0&size=50&sort=performedAt%2Cdesc`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonRule: {
                  condition: "AND",
                  rules: [
                    { field: "related_to", operator: "equal", id: "related_to", type: "related_lookup", value: { entity: "deal", id: String(dealId) } },
                    { field: "systemDefault", operator: "equal", id: "systemDefault", type: "boolean", value: false },
                    { field: "category", operator: "equal", id: "category", type: "string", value: "ALL" },
                  ],
                  valid: true,
                },
              }),
            }
          );
          if (feedsRes?.ok) {
            const feedsData = await feedsRes.json();
            setTimelineMap((prev) => ({ ...prev, [dealId]: parseTimeline(feedsData.content ?? []) }));
          }
        } catch { /* skip */ }
      }

      if (!contactId) return;

      try {
        const contactRes = await pacedFetch(`/api/contacts/${contactId}`);
        const contactData = contactRes?.ok ? await contactRes.json() : null;
        const phones = ((contactData?.phoneNumbers ?? []) as { value?: string; dialCode?: string }[])
          .map((p) => (`${p.dialCode ?? ""}${p.value ?? ""}`).replace(/\D/g, ""))
          .filter((p) => p.length >= 7);
        const leadIds = ((contactData?.convertedLeads ?? []) as { id: number }[]).map((l) => l.id);

        const allCalls: CallLog[] = [];
        for (let pg = 1; pg <= 3; pg++) {
          await new Promise((r) => setTimeout(r, 500));
          const r = await pacedFetch(`/api/call-logs?size=500&page=${pg}`);
          if (r?.ok) {
            const d = await r.json();
            allCalls.push(...(d.content ?? []));
          }
        }

        const matched = allCalls
          .filter((c) => {
            const cands = [c.phoneNumber, c.originator, c.receiver]
              .map((v) => (v ?? "").replace(/\D/g, ""))
              .filter((s) => s.length >= 7);
            const pMatch = cands.some((cn) => phones.some((ph) => cn.slice(-10) === ph.slice(-10)));
            const rels = c.relatedTo ?? [];
            const rMatch = rels.some(
              (r) =>
                (r.entity === "contact" && r.id === contactId) ||
                (r.entity === "lead" && leadIds.includes(r.id))
            );
            return pMatch || rMatch;
          })
          .sort((a, b) => new Date(b.startTime ?? b.createdAt).getTime() - new Date(a.startTime ?? a.createdAt).getTime());
        setExpandedCallLogs(matched.slice(0, 10));
      } catch { /* skip */ }
    } catch { /* ignore */ }
  }

  async function reloadDealNotes(dealId: number) {
    try {
      const detail = await fetch(`/api/deals/${dealId}`, { cache: "no-store" }).then((r) => r.json());
      const ownerId = detail.ownedBy?.id;
      const noteParams = new URLSearchParams({
        targetEntityId: String(dealId),
        targetEntityType: "DEAL",
        sort: "createdAt,desc",
        page: "0",
        size: "20",
      });
      if (ownerId) noteParams.set("targetEntityOwnerId", String(ownerId));
      const notesRes = await fetch(`/api/notes/relation?${noteParams}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ content: [] }));
      setDealNotes(
        (notesRes.content ?? []).map((n: { id: number; description?: string; createdAt?: string | number }) => ({
          id: n.id,
          description: (n.description ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
          createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt,
        }))
      );
    } catch { /* ignore */ }
  }

  async function handleAddNote(dealId: number) {
    if (!noteText.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSuccess(false);
    try {
      const res = await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>[${userName ?? "Unknown"}]</b> ${noteText.trim()}</div>` },
          targetEntityId: String(dealId),
          targetEntityType: "DEAL",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed: ${res.status}`);
      }
      const savedText = noteText.trim();
      setNoteText("");
      setNoteSuccess(true);
      setNoteTargetDeal(null);
      setLastAction((prev) => ({ ...prev, [dealId]: { type: "note", text: savedText } }));
      setTimeout(() => setNoteSuccess(false), 5000);
      reloadDealNotes(dealId);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleUpload(dealId: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files[]", files[i]);
      }
      formData.append("entityId", String(dealId));
      formData.append("entityType", "deal");
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed: ${res.status}`);
      }
      // Auto-log who uploaded
      const fileNames = Array.from(files).map((f) => f.name).join(", ");
      await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>[${userName ?? "Unknown"}]</b> uploaded: ${fileNames}</div>` },
          targetEntityId: String(dealId),
          targetEntityType: "DEAL",
        }),
      }).catch(() => {});
      setUploadSuccess(true);
      setUploadTargetDeal(null);
      setLastAction((prev) => ({ ...prev, [dealId]: { type: "doc", text: fileNames } }));
      setTimeout(() => setUploadSuccess(false), 5000);
      reloadDealNotes(dealId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setExactMode(false);
    setQuery(inputValue);
  }

  function handleClear() {
    setInputValue("");
    setQuery("");
    setExactMode(false);
    const r = dateFilterRange(activeDateFilter);
    setFrom(r.from);
    setTo(r.to);
  }

  function handleDateChip(chip: DateFilter) {
    setActiveDateFilter(chip);
    const r = dateFilterRange(chip);
    setFrom(r.from);
    setTo(r.to);
  }

  // Filtered deals by status
  const statusCounts = useMemo(() => {
    const counts = { all: deals.length, open: 0, waiting: 0, resolved: 0 };
    for (const d of deals) {
      const cat = classifyStage(d.pipelineStage?.name ?? "");
      if (cat === "open") counts.open++;
      else if (cat === "waiting") counts.waiting++;
      else if (cat === "resolved") counts.resolved++;
    }
    return counts;
  }, [deals]);

  const filteredDeals = useMemo(() => {
    if (activeStatusFilter === "all") return deals;
    return deals.filter((d) => classifyStage(d.pipelineStage?.name ?? "") === activeStatusFilter);
  }, [deals, activeStatusFilter]);

  // ---- Render ----

  return (
    <div className="w-full">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-3">
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search ENQ, ticket, owner\u2026"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-9 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Date filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1 scrollbar-hide">
        {DATE_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => handleDateChip(chip.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeDateFilter === chip.value
                ? "bg-[#EAB308] text-gray-950"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex gap-3 mb-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {([
          { value: "all" as StatusFilter, label: `All (${statusCounts.all})` },
          { value: "open" as StatusFilter, label: `Open (${statusCounts.open})` },
          { value: "waiting" as StatusFilter, label: `Waiting (${statusCounts.waiting})` },
          { value: "resolved" as StatusFilter, label: `Resolved (${statusCounts.resolved})` },
        ]).map((chip) => (
          <button
            key={chip.value}
            onClick={() => setActiveStatusFilter(chip.value)}
            className={`shrink-0 text-xs font-semibold pb-1 transition-colors ${
              activeStatusFilter === chip.value
                ? "text-gray-900 border-b-2 border-yellow-400"
                : "text-gray-400"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result count — human-readable */}
      {!loading && !error && (
        <p className="text-xs text-gray-500 mb-3">
          {filteredDeals.length} request{filteredDeals.length !== 1 ? "s" : ""}
          {" · "}
          {dateFilterLabel(activeDateFilter)}
          {query ? ` · "${query}"` : ""}
        </p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Deal cards */}
      {!loading && filteredDeals.length > 0 && (
        <div className="space-y-3">
          {filteredDeals.map((deal) => {
            const timeline = timelineMap[deal.id] ?? [];
            return (
              <div
                key={deal.id}
                onClick={() => {
                  if (selectedDeal?.id === deal.id) {
                    setSelectedDeal(null);
                  } else {
                    setSelectedDeal(deal);
                    handleExpandDeal(deal.id);
                  }
                }}
                className={`rounded-xl border border-l-4 overflow-hidden cursor-pointer transition-colors ${cardBorderColor(deal)} ${
                  selectedDeal?.id === deal.id ? "border-yellow-400 bg-yellow-50/60" : "border-gray-200 hover:bg-yellow-50/40"
                }`}
              >
                {/* Always visible card */}
                <div className="p-3">
                  {/* Row 1: Deal name + stage pill */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-gray-900 leading-tight truncate flex-1">
                      {deal.name}
                    </h3>
                    {deal.pipelineStage?.name && (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${stagePillStyle(deal)}`}>
                        {deal.pipelineStage.name}
                      </span>
                    )}
                  </div>

                  {/* Row 2: Contact + Owner + SLA badge */}
                  <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 flex-wrap">
                    {contactMap[deal.id]?.name && (
                      <><span className="text-yellow-700 font-medium">{contactMap[deal.id]!.name}</span><span>·</span></>
                    )}
                    {deal.ownedBy?.name && <span>{deal.ownedBy.name}</span>}
                    {deal.ownedBy?.name && deal.createdAt && <span>·</span>}
                    {deal.createdAt && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-medium text-gray-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {relativeAge(deal.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setNoteTargetDeal(noteTargetDeal === deal.id ? null : deal.id); }}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 cursor-pointer"
                      title="Add Note"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setUploadTargetDeal(uploadTargetDeal === deal.id ? null : deal.id); }}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 cursor-pointer"
                      title="Upload Doc"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                    </button>
                  </div>

                  {/* Inline add note */}
                  {noteTargetDeal === deal.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Type a note\u2026"
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                      />
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => handleAddNote(deal.id)}
                          disabled={savingNote || !noteText.trim()}
                          className="px-4 py-1.5 rounded-lg bg-gray-950 text-yellow-400 text-xs font-semibold disabled:opacity-50"
                        >
                          {savingNote ? "Saving\u2026" : "Save"}
                        </button>
                        <button onClick={() => setNoteTargetDeal(null)} className="text-xs text-gray-400">Cancel</button>
                        {noteSuccess && <span className="text-xs text-green-600">Saved</span>}
                        {noteError && <span className="text-xs text-red-600">{noteError}</span>}
                      </div>
                    </div>
                  )}

                  {/* Inline upload doc */}
                  {uploadTargetDeal === deal.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                      <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-3 cursor-pointer active:border-yellow-400 ${uploading ? "opacity-50" : ""}`}>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="text-xs text-gray-500">{uploading ? "Uploading\u2026" : "Select files"}</span>
                        <input type="file" multiple className="hidden" onChange={(e) => handleUpload(deal.id, e.target.files)} disabled={uploading} />
                      </label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button onClick={() => setUploadTargetDeal(null)} className="text-xs text-gray-400">Cancel</button>
                        {uploadSuccess && <span className="text-xs text-green-600">Uploaded</span>}
                        {uploadError && <span className="text-xs text-red-600">{uploadError}</span>}
                      </div>
                    </div>
                  )}

                  {/* Last action preview */}
                  {lastAction[deal.id] && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                      <span className="text-green-600 text-sm mt-0.5">✓</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-green-700">
                          {lastAction[deal.id].type === "note" ? "Note added" : "Document uploaded"}
                        </p>
                        <p className="text-xs text-green-600 truncate">{lastAction[deal.id].text}</p>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredDeals.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No requests found.
        </div>
      )}

      {/* Detail sidebar */}
      {selectedDeal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[999] bg-black/20"
            onClick={() => setSelectedDeal(null)}
          />
          {/* Panel */}
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
              {loadingExpanded ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Resolution box */}
                  <div className="rounded-lg bg-yellow-50 border border-yellow-100 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-700 mb-2">Resolution Details</p>
                    <div className="space-y-1.5">
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

                  {/* Timeline */}
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

                  {/* Notes */}
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

                  {/* Call logs */}
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
      )}
    </div>
  );
}

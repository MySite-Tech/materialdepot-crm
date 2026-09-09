'use client';

import { ESC_SUPPORT_PIPELINE_RULE, PRESETS, SEARCH_FIELDS, TRACKED_FIELDS } from '../constants/escalation';
import { DateFilter, Preset, StatusFilter, TimelineEntry } from '../types/escalation';
import { CallLog, Deal } from '@/lib/types/index';

export function buildBody(query: string, fromIso: string | null, toIso: string | null) {
  const rules: unknown[] = [ESC_SUPPORT_PIPELINE_RULE];
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
  return {
    fields: SEARCH_FIELDS,
    jsonRule: { condition: "AND", rules, valid: true },
  };
}

function toLocalDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(input: string) {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function endOfDay(input: string) {
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

export function isEscalationOrSupport(deal: Deal) {
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

export function cfDisplayValue(val: unknown): string {
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

export function parseTimeline(feeds: { id: number; action?: { event?: string; name?: string; associatedEntity?: { entity?: string; name?: string } }; payload?: { old?: Record<string, unknown>; new?: Record<string, unknown> }; performedBy?: { name?: string }; createdAt?: string }[]): TimelineEntry[] {
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

export const outcomeStyle: Record<string, string> = {
  connected: "bg-green-100 text-green-700",
  missed_call: "bg-red-100 text-red-700",
  not_connected: "bg-gray-100 text-gray-600",
  voicemail: "bg-yellow-100 text-yellow-700",
};

export function dateFilterRange(f: DateFilter): { from: string; to: string } {
  if (f === "all") return { from: "", to: "" };
  if (f === "today") return presetRange("today");
  if (f === "yesterday") return presetRange("yesterday");
  if (f === "month") return presetRange("current_month");

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  return { from: toLocalDateInput(weekAgo), to: toLocalDateInput(today) };
}

export function dateFilterLabel(f: DateFilter): string {
  switch (f) {
    case "today": return "today";
    case "yesterday": return "yesterday";
    case "7days": return "past 7 days";
    case "month": return "this month";
    case "all": return "all time";
  }
}

export function classifyStage(stageName: string): StatusFilter {
  const s = stageName.toLowerCase();
  if (/resolved|won|completed|closed/.test(s)) return "resolved";
  if (/awaiting|dependency/.test(s)) return "waiting";
  if (/progress|new/.test(s)) return "open";
  return "open";
}

export function relativeAge(iso: string | null | undefined): string {
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

export function relativeTimeBetween(fromIso: string, toIso: string): string {
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

export function cardBorderColor(deal: Deal): string {
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

export function stagePillStyle(deal: Deal): string {
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

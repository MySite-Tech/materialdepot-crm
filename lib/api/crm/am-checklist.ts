import { mdFetch } from '../core/client';

export type FollowupOutcome = 'manager_spoke' | 'bm_spoke' | 'whatsapp_only';
export type PriorityStatus = 'closed' | 'wip' | 'cancelled';

export interface AmBmIdentity {
  id: number;
  user_id: number;
  name: string;
  first_name: string;
  contact: string | null;
  branches: string[];
  am: { id: number; name: string } | null;
}

export interface AmProgress {
  not_placed: number;
  reasons: number;
  priorities: number;
  priorities_marked: number;
  followups: number;
  followups_done: number;
  grooming_score: number | null;
  todo: number;
  done: boolean;
}

export interface AmPriority {
  text: string;
  status: PriorityStatus | null;
  /** Set when this is a WIP carried over from an earlier day. */
  from: string | null;
}

export interface AmTicket {
  ticket_id: number;
  /** Deal ticket the lead's remarks live on (null if the lead has none). */
  deal_ticket_id: number | null;
  client_name: string | null;
  contact: string | null;
  cart_number: string | null;
  cart_value: number;
  followup_date: string | null;
  closure_date: string | null;
  latest_remark: { text: string; created_at: string } | null;
}

export interface AmClosure extends AmTicket {
  client_id?: number | null;
  placed: boolean;
  placed_value: number | null;
  reason: string;
}

export interface AmFollowup extends AmTicket {
  bucket: 'overdue' | 'today';
  outcome: FollowupOutcome | null;
}

/** A new day starts with every item null and score null (asked, not scored). */
export interface AmGrooming {
  items: Record<string, boolean | null>;
  score: number | null;
  out_of: number;
}

/** Closures and follow-ups open at the cutoff (1 PM IST); grooming is open all day. */
export interface AmCutoff {
  time: string;
  label: string;
  open: boolean;
  frozen_at?: string | null;
}

export interface AmBmListEntry extends AmBmIdentity {
  started: boolean;
  progress: AmProgress;
  summary: {
    not_placed: Array<{ client_name: string | null; cart_value: number; reason: string }>;
    placed: Array<{ client_name: string | null; placed_value: number | null }>;
    expected_today: number;
    priorities: AmPriority[];
    followup_outcomes: Array<FollowupOutcome | null>;
  };
}

export interface AmBmList {
  date: string;
  locked: boolean;
  cutoff: AmCutoff;
  done_count: number;
  total: number;
  branches: Array<{ id: number; name: string }>;
  bms: AmBmListEntry[];
}

export interface AmBmDay {
  date: string;
  locked: boolean;
  bm: AmBmIdentity;
  cutoff: AmCutoff;
  closures: { yesterday_date: string; yesterday: AmClosure[]; today: AmTicket[] | null };
  priorities: AmPriority[];
  followups: AmFollowup[];
  grooming: AmGrooming | null;
  progress: AmProgress;
  questions: {
    grooming: Array<{ id: string; label: string }>;
    followup_outcomes: Array<{ id: FollowupOutcome; label: string }>;
  };
  filled_by: { id: number; name: string } | null;
  updated_at: string | null;
}

export interface AmSavePayload {
  grooming?: { items: Record<string, boolean> };
  priorities?: AmPriority[];
  followups?: Array<{ ticket_id: number; outcome: FollowupOutcome | null }>;
  closures?: Array<{ ticket_id: number; reason: string }>;
}

const qs = (params: Record<string, string | number | null | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return entries.length ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

// GETs skip mdFetch's short-lived cache (passing a signal does that) so the
// list reflects a save made a moment ago.
export function fetchAmBms(date: string, branchId?: number | null, signal?: AbortSignal): Promise<AmBmList> {
  return mdFetch(`/am-checklist/bms/${qs({ date, branch: branchId })}`, { signal: signal ?? new AbortController().signal });
}

export function fetchAmBmDay(bmId: number, date: string, signal?: AbortSignal): Promise<AmBmDay> {
  return mdFetch(`/am-checklist/bms/${bmId}/${qs({ date })}`, { signal: signal ?? new AbortController().signal });
}

export function saveAmBmDay(bmId: number, date: string, payload: AmSavePayload): Promise<AmBmDay> {
  return mdFetch(`/am-checklist/bms/${bmId}/${qs({ date })}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** The BM's own daily card (same payload the app's My Day shows). Today only. */
export function fetchAmBmDailyCard(bmId: number, signal?: AbortSignal): Promise<DailyCard> {
  return mdFetch(`/am-checklist/bms/${bmId}/daily-card/`, { signal: signal ?? new AbortController().signal });
}

interface Share { count: number; of: number; pct: number | null; color: string }

export interface DailyCard {
  rep: { name?: string } & Record<string, unknown>;
  branch: string | null;
  server_time_ist: string;
  date: string;
  today: {
    clients_attended: number;
    carts_created: Share;
    crm_remarks: Share;
    remark_quality: { avg: number | null; out_of: number; leads_scored: number };
    revenue: number;
    orders: number;
  };
  ordered_clients: { count: number; target: number; expected_by_today: number };
  followups: { overdue: number; due_today: number; upcoming: number };
  grooming: { scored: boolean; score: number | null; out_of: number; missed: string[] } | null;
  month_to_date: { revenue: number; orders: number; aov: number | null; footfall: number };
}

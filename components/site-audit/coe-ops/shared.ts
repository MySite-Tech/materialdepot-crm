/* Category Ops Executive — follow-up queue logic, TS port of
   material-depot-site's COE_Dashboard.html (site-audit → order conversion
   call queue). See CLAUDE.md note 102 in that repo for the full spec. */

import { phoneKey, sbGet, sbPatch, sbPost } from '../siteAuditShared';
import { typeLabel } from '../auditRegistry';
import { WP_ROUND_KEYS, wpRounds, wpStageLabel, type WpNext, type WpRow } from './wpTrack';

// Q1/Q2/Q3 review scores, taken on this D+1 call rather than on-site (see note 117 in the sibling
// material-depot-site repo — the field worker being rated handing the client the phone to score
// them, right before signing, structurally biased every score upward).
export type CoeCall = { id: string; ts: string; stage: string; who: string; outcome: string; note: string; ratings?: { q1: number; q2: number; q3: number }; by?: { email?: string; name?: string } };
export type CoeOrderPlaced = { kind?: string; ref?: string; at: string; by?: { email?: string; name?: string }; auto?: boolean; orderId?: string };
export type CoeTrack = {
  calls?: CoeCall[];
  order_placed?: CoeOrderPlaced | null;
  result?: 'converted' | 'lost' | null;
  lost_reason?: string;
  snooze_until?: string | null;
};

export type CoeOrder = {
  id: string; pi: string; po: string[]; skus: any[]; bm: string; bmEmail: string | null;
  name: string; phone: string; addr: string; status: string; service: any; slot: string | null;
  date: string | null; auditorName: string | null; auditorEmail: string | null; createdAt: string | null;
  city: string | null; coeTrack: CoeTrack;
  /* Canonical category labels the AUDITOR ticked, merged in from the separate
     AUDIT_TICKED_QUERY (see below) rather than carried by AUDIT_COLS — which is
     why it starts empty and fills in a beat later. */
  tickedCats: string[];
};
export type CoeInstall = {
  id: string; pi: string; po: string[]; phone: string; name: string; addr: string; bm: string;
  createdAt: string | null; status: string; customWp: boolean; deliveryDate: string | null;
  subjobs: CoeSubjob[]; log: any[];
};

// A minimal, purpose-built view of one install sub-job — this module stays self-contained rather
// than importing install-ops/types.ts's heavier Subjob, matching how CoeOrder/CoeInstall are
// already deliberately lean types independent of the SM ops view's data model.
export type CoeSubjobAssignment = { installer_email?: string; installer_name?: string; primary?: boolean };
export type CoeSubjob = {
  id: string; type: string; status: string; assignments?: CoeSubjobAssignment[];
  installer_email?: string | null; installer?: string | null;
  coe_review?: { calls?: CoeCall[] };
};

/* `log` is deliberately NOT here. It is jsonb averaging ~7 KB a row — on the
   completed-audit set that is 1.8 MB of the ~1.9 MB this view re-fetches every
   30 seconds — and it is read in exactly one place, the drawer's "Order
   timeline", for one order at a time. It is fetched per order on open instead
   (loadOrderLog below). patchCoe re-reads it before every write regardless, so
   nothing that mutates the log depends on the list carrying it. */
export const AUDIT_COLS = 'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_name,auditor_email,created_at,city,coe_track';
// addr/bm/subjobs/log added for the Install Reviews tab (note 117) — subjobs carries each
// completed sub-job's coe_review.calls[], log is scanned for its completion date/type.
export const INSTALL_COLS = 'id,pi,po,phone,customer_name,addr,bm,created_at,status,custom_wp,delivery_date,subjobs,log';

export function mapCoeAudit(r: any): CoeOrder {
  return {
    id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    skus: r.skus || [], bm: r.bm || '—', bmEmail: r.bm_email || null,
    name: r.customer_name || '', phone: r.phone || '', addr: r.addr || '',
    status: r.status || 'pending', service: r.service || null, slot: r.slot || null, date: r.date || null,
    auditorName: r.auditor_name || null, auditorEmail: r.auditor_email || null, createdAt: r.created_at || null,
    city: r.city || null, coeTrack: (r.coe_track && typeof r.coe_track === 'object') ? r.coe_track : {},
    tickedCats: [],
  };
}
export function mapCoeInstall(r: any): CoeInstall {
  return {
    id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    phone: r.phone || '', name: r.customer_name || '', addr: r.addr || '', bm: r.bm || '—',
    createdAt: r.created_at || null,
    status: r.status || '', customWp: !!r.custom_wp, deliveryDate: r.delivery_date || null,
    subjobs: Array.isArray(r.subjobs) ? r.subjobs : [],
    log: Array.isArray(r.log) ? r.log : [],
  };
}

/* The three call checkpoints the COE runs, in days after the site audit. d1
   always applies (it's a service-quality review, done even for converted
   clients); d3/d14 only chase an order that hasn't happened, so they drop
   away the moment one is placed. */
export type Checkpoint = { k: 'd1' | 'd3' | 'd14'; days: number; label: string; who: 'client' | 'bm' | 'both'; always: boolean; hint: string };
export const CHECKPOINTS: Checkpoint[] = [
  { k: 'd1', days: 1, label: 'D+1 · Client audit review', who: 'client', always: true, hint: 'Call the client for their review of the site audit.' },
  { k: 'd3', days: 3, label: 'D+3 · BM update (no cart yet)', who: 'bm', always: false, hint: 'No new cart in 3 days — ask the BM why.' },
  { k: 'd14', days: 14, label: 'D+14 · BM + client update', who: 'both', always: false, hint: 'No material/installation order after 14 days — take an update from both the BM and the client.' },
];
export const OUTCOMES = [
  { k: 'reached', l: 'Spoke to them' },
  { k: 'no_reply', l: 'No reply / call not returned' },
  { k: 'not_picked', l: "Didn't pick the call" },
  { k: 'wrong_number', l: 'Wrong / unreachable number' },
];
export type BucketKey = 'overdue' | 'today' | 'upcoming' | 'snoozed' | 'open' | 'converted' | 'lost';
export const BUCKETS: Array<{ k: BucketKey; l: string; cls: string }> = [
  { k: 'overdue', l: 'Overdue', cls: 's-red' },
  { k: 'today', l: 'Due today', cls: 's-amber' },
  { k: 'upcoming', l: 'Upcoming', cls: '' },
  { k: 'snoozed', l: 'Snoozed', cls: '' },
  { k: 'open', l: 'Awaiting outcome', cls: '' },
  { k: 'converted', l: 'Converted', cls: 's-green' },
  { k: 'lost', l: 'Lost / closed', cls: '' },
];

export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / 86400000);
}

/* The day the site audit actually happened. o.date is the scheduled/visit
   date; fall back to creation date for the handful of legacy orders that
   never got one. */
export function anchorDate(o: CoeOrder): string | null {
  return o.date || (o.createdAt ? String(o.createdAt).slice(0, 10) : null);
}

/* THE swappable order-placed signal. When Material Depot's other system
   exposes carts and product-only orders, this is the ONLY function that has
   to change.
     1. an explicit COE tick always wins (covers carts + product-only orders
        this app can't see)
     2. otherwise: an installation order for the same phone, created on or
        after the audit day.
   Scoped per audit on purpose — a client can have several audits and several
   orders, so "this phone ever ordered" would wrongly mark a fresh audit as
   converted off the back of an older, unrelated order. */
export function orderPlacedFor(o: CoeOrder, installsByPhone: Map<string, CoeInstall[]>): CoeOrderPlaced | null {
  const man = o.coeTrack?.order_placed || null;
  if (man && man.at) return { ...man, auto: false };
  const anchor = anchorDate(o);
  const key = phoneKey(o.phone);
  if (!anchor || !key) return null;
  // Keyed through phoneKey on BOTH sides (see CoeView's installByPhone) — the
  // two tables are filled in by different apps and a stray +91 or space on
  // either would silently break the join, leaving the COE chasing D+3/D+14 on
  // a client who has already ordered.
  const list = installsByPhone.get(key) || [];
  const hit = list.find((io) => io.createdAt && String(io.createdAt).slice(0, 10) >= anchor);
  if (!hit) return null;
  return { auto: true, kind: 'installation', ref: hit.pi || '', at: hit.createdAt!, orderId: hit.id };
}

/* The drawer's "Order timeline" — every actor's activity on this order, not
   just the COE's. One order, on open. Returns [] on any failure: a missing
   timeline must never block the call-logging the drawer exists for. */
export async function loadOrderLog(orderId: string): Promise<any[]> {
  const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=log');
  return Array.isArray(rows) && rows[0] && Array.isArray(rows[0].log) ? rows[0].log : [];
}

export function coeCalls(o: CoeOrder): CoeCall[] {
  const c = o.coeTrack?.calls;
  return Array.isArray(c) ? c : [];
}

export type CheckpointState = Checkpoint & {
  applies: boolean; dueOn: string | null; state: 'n/a' | 'done' | 'pending' | 'overdue' | 'due';
  calls: CoeCall[]; last: CoeCall | null;
};

/* Per-checkpoint state for one audit order. Everything is derived from the
   append-only calls[] log, so there is no second copy of "is D+1 done" that
   can fall out of sync. */
export function checkpointState(o: CoeOrder, placed: CoeOrderPlaced | null, today: string): CheckpointState[] {
  const anchor = anchorDate(o);
  const calls = coeCalls(o);
  return CHECKPOINTS.map((cp) => {
    const done = calls.filter((c) => c.stage === cp.k).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const applies = cp.always || !placed;
    const dueOn = anchor ? addDays(anchor, cp.days) : null;
    let state: CheckpointState['state'] = 'n/a';
    if (applies) {
      if (done.length) state = 'done';
      else if (!dueOn) state = 'pending';
      else if (dueOn < today) state = 'overdue';
      else if (dueOn === today) state = 'due';
      else state = 'pending';
    }
    return { ...cp, applies, dueOn, state, calls: done, last: done.length ? done[done.length - 1] : null };
  });
}

/* Buckets are mutually exclusive and always sum to the total. Action needed
   outranks outcome, so a converted client with an unanswered D+1 review
   still surfaces as due. */
export function bucketFor(o: CoeOrder, placed: CoeOrderPlaced | null, today: string): BucketKey {
  const t = o.coeTrack || {};
  if (t.result === 'lost') return 'lost';
  const cps = checkpointState(o, placed, today);
  const pending = cps.filter((c) => c.applies && c.state !== 'done');
  if (t.snooze_until && t.snooze_until > today && !pending.some((c) => c.state === 'overdue')) return 'snoozed';
  if (pending.some((c) => c.state === 'overdue')) return 'overdue';
  if (pending.some((c) => c.state === 'due')) return 'today';
  if (placed || t.result === 'converted') return 'converted';
  if (pending.length) return 'upcoming';
  return 'open';
}

/* ── Categories: ONE vocabulary for both halves of this dashboard ──────────
   The Followups and Install Reviews tables now carry a category column that is
   also a filter, so audit categories and installation categories have to be
   the SAME strings — an audit labelled "Flooring" and a sub-job labelled
   "Wooden Flooring" would give the filter two entries for one material and
   silently split every count. These labels are `auditRegistry`'s `pdfLabel`s
   plus Custom Wallpaper, which is a wallpaper VARIANT rather than a registry
   category and is what the COE's whole Wallpaper tab is about — so it has to
   be separable here.

   `CAT_UNSET` is a filter option, not a category: 92% of completed audits can
   be labelled from `audit_ticked` (see below) and the rest genuinely have
   nothing recorded. Folding those into a real category would put orders under
   a material nobody ticked; giving them their own bucket makes the gap
   filterable, which is the honest version. */
export const CAT_FLOORING = 'Wooden Flooring';
export const CAT_WALLPAPER = 'Wallpaper';
export const CAT_CUSTOM_WP = 'Custom Wallpaper';
export const CAT_WALLPANEL = 'Wall Panels';
export const CAT_CNC = 'CNC';
export const CAT_UNSET = 'Not recorded';

/* Display order, so an order with two categories renders its pills the same
   way every time (the raw room order varies row to row). */
export const CATEGORY_ORDER = [CAT_FLOORING, CAT_WALLPAPER, CAT_CUSTOM_WP, CAT_WALLPANEL, CAT_CNC];

/* Pill palette key per category, matching the colours this table already used
   for flooring/wallpaper/custom WP. */
export const CATEGORY_TONE: Record<string, string> = {
  [CAT_FLOORING]: '', [CAT_WALLPAPER]: 'wp', [CAT_CUSTOM_WP]: 'cwp',
  [CAT_WALLPANEL]: 'wpl', [CAT_CNC]: 'cnc',
};

function sortCats(list: string[]): string[] {
  return [...new Set(list)].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
}

/* The auditor's ticked categories, in the two shapes live data actually holds
   (330 completed audits as of 2026-09-01):

     - 313 rows: the v3 job card, `{rooms:[{category|type, variant}]}`. A
       wallpaper room whose `variant` is Customized is Custom Wallpaper, which
       is the distinction the COE's wallpaper production queue turns on.
     - 17 rows: a flat string list from the pre-job-card tick screen
       ('Wooden Flooring' | 'Standard Wallpapers' | 'Custom Wallpapers').

   A room with NEITHER `category` nor `type` (45 live rooms) is skipped rather
   than defaulted: `categoryFor`/`typeLabel` both fall back to flooring, which
   would invent a material for an order whose auditor never recorded one. */
const TICKED_LIST_LABELS: Record<string, string> = {
  'wooden flooring': CAT_FLOORING, flooring: CAT_FLOORING, 'spc flooring': CAT_FLOORING,
  'standard wallpapers': CAT_WALLPAPER, 'standard wallpaper': CAT_WALLPAPER, wallpaper: CAT_WALLPAPER,
  'custom wallpapers': CAT_CUSTOM_WP, 'custom wallpaper': CAT_CUSTOM_WP, 'customized wallpaper': CAT_CUSTOM_WP,
  'wall panels': CAT_WALLPANEL, wallpanel: CAT_WALLPANEL, cnc: CAT_CNC,
};
const TICKED_ROOM_LABELS: Record<string, string> = {
  flooring: CAT_FLOORING, wallpaper: CAT_WALLPAPER, wallpanel: CAT_WALLPANEL, cnc: CAT_CNC,
};

export function tickedCategories(auditTicked: any): string[] {
  if (Array.isArray(auditTicked)) {
    return sortCats(auditTicked
      .map((x: any) => TICKED_LIST_LABELS[String(x || '').trim().toLowerCase()])
      .filter(Boolean) as string[]);
  }
  const rooms = auditTicked && Array.isArray(auditTicked.rooms) ? auditTicked.rooms : null;
  if (!rooms) return [];
  const out: string[] = [];
  for (const r of rooms) {
    const key = String((r && (r.category || r.type)) || '').toLowerCase();
    let label = TICKED_ROOM_LABELS[key];
    if (!label) continue;
    if (label === CAT_WALLPAPER && String((r && r.variant) || '').toLowerCase().startsWith('custom')) label = CAT_CUSTOM_WP;
    out.push(label);
  }
  return sortCats(out);
}

/* The supplementary query that fills `tickedCats`, kept out of AUDIT_COLS for
   the same reason `audit-ops/shared.ts` keeps its own AUDIT_CATEGORY_QUERY
   apart: `audit_ticked` on a COMPLETED audit is the whole job card. Scoped to
   the statuses this dashboard lists it is 330 rows / ~1.2 MB / ~1.4s, which is
   fine ONCE but is not something to put in a 30s poll — see the caller in
   SiteAuditCoeView, which only re-asks when an audit it has no answer for
   appears. (A completed audit's job card is terminal, so the answer doesn't
   go stale.) */
export const AUDIT_TICKED_QUERY = 'audit_orders?select=id,audit_ticked&status=eq.completed';

/* id → ticked categories. Mapped straight out of the response so the job-card
   photo URLs behind it are never retained. */
export function auditCategoryMap(rows: any[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    m.set(String(r.id), tickedCategories(r.audit_ticked));
  }
  return m;
}

export function applyCoeCategories(orders: CoeOrder[], cats: Map<string, string[]>): CoeOrder[] {
  if (!cats.size) return orders;
  return orders.map((o) => {
    const t = cats.get(String(o.id));
    // Reference-stable when nothing changes, so the memoised row build downstream
    // isn't invalidated by every poll.
    if (!t || (t.length === o.tickedCats.length && t.every((x, i) => x === o.tickedCats[i]))) return o;
    return { ...o, tickedCats: t };
  });
}

/* Canonical categories for one audit: what the auditor ticked, else the created
   service, else the SKU codes. The last two are what this function used to
   have on its own and answered 12 of 330 completed audits; `tickedCats`
   answers 302 of them. They stay as the fallback because a pre-service or
   legacy row has no job card at all. */
export function auditCategories(o: CoeOrder): string[] {
  if (o.tickedCats.length) return o.tickedCats;
  const out: string[] = [];
  const svc = o.service || {};
  if (Array.isArray(svc.flooring) && svc.flooring.length) out.push(CAT_FLOORING);
  if (Array.isArray(svc.wallpaper) && svc.wallpaper.length) out.push(CAT_WALLPAPER);
  const codes = (o.skus || []).filter((s: any) => !s.audit).map((s: any) => String(s.c || '').toUpperCase()).join(' ');
  if (/CWP-|CUSTOM/.test(codes)) out.push(CAT_CUSTOM_WP);
  if (!out.length) {
    if (/WF-|FLOOR/.test(codes)) out.push(CAT_FLOORING);
    if (/WP-|WALL/.test(codes)) out.push(CAT_WALLPAPER);
  }
  return sortCats(out);
}

/* One installation sub-job's category, in the same vocabulary. `typeLabel` is
   the install surfaces' own short label ('Flooring'), so it is mapped rather
   than used directly — otherwise the filter would carry both 'Flooring' and
   'Wooden Flooring' for one material.

   `custom_wp` is a flag on the ORDER, not a sub-job type: a custom-wallpaper
   job's sub-job still reads `wallpaper`. Without that check this filter and the
   COE's own custom-wallpaper production queue would disagree about which
   installations are custom, which is the one distinction that tab exists for. */
export function subjobCategory(sj: CoeSubjob, io?: CoeInstall): string {
  const base = TICKED_ROOM_LABELS[String(sj.type || '').toLowerCase()];
  if (!base) return CAT_UNSET;
  if (base === CAT_WALLPAPER && io?.customWp) return CAT_CUSTOM_WP;
  return base;
}

/* Does a row pass a category filter? An empty selection means "no filter" —
   never "nothing matches", which is the reading that empties a table the
   moment somebody clears the last chip. */
export function matchesCategory(cats: string[], selected: string[]): boolean {
  if (!selected.length) return true;
  if (!cats.length) return selected.includes(CAT_UNSET);
  return cats.some((c) => selected.includes(c));
}

/* ── Date range filtering ─────────────────────────────────────────────────
   Both queues and the NPS analytics tab filter by date, and all three have to
   agree on what "Last 30 days" means or a COE comparing two tabs is comparing
   two windows. Ranges are INCLUSIVE on both ends and compared as YYYY-MM-DD
   strings, which is what every date column in this schema already is. */
export type DateRange = { from: string; to: string };
export type DatePresetKey = 'all' | 'today' | 'last7' | 'last30' | 'last90' | 'thismonth' | 'lastmonth' | 'custom';
export const DATE_PRESETS: Array<{ k: DatePresetKey; l: string }> = [
  { k: 'all', l: 'All time' },
  { k: 'today', l: 'Today' },
  { k: 'last7', l: 'Last 7 days' },
  { k: 'last30', l: 'Last 30 days' },
  { k: 'last90', l: 'Last 90 days' },
  { k: 'thismonth', l: 'This month' },
  { k: 'lastmonth', l: 'Last month' },
];

/* `{from:'', to:''}` is the "all time" range — an empty bound is unbounded, so
   `inDateRange` needs no separate no-filter flag. */
export function presetRange(k: DatePresetKey): DateRange {
  const today = todayStr();
  const monthStart = (y: number, m: number) => y + '-' + String(m + 1).padStart(2, '0') + '-01';
  const d = new Date(today + 'T00:00');
  switch (k) {
    case 'today': return { from: today, to: today };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'last90': return { from: addDays(today, -89), to: today };
    case 'thismonth': return { from: monthStart(d.getFullYear(), d.getMonth()), to: today };
    case 'lastmonth': {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: monthStart(first.getFullYear(), first.getMonth()), to: last.getFullYear() + '-' + String(last.getMonth() + 1).padStart(2, '0') + '-' + String(last.getDate()).padStart(2, '0') };
    }
    default: return { from: '', to: '' };
  }
}

/* The immediately preceding window of the same length, for a "vs prev" delta.
   `null` for an unbounded range, because "before all time" is not a period. */
export function previousRange(r: DateRange): DateRange | null {
  if (!r.from || !r.to) return null;
  const span = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -span), to: addDays(r.from, -1) };
}

/* The picker's button label. A custom range prints both ends, because "custom"
   on its own tells a COE reading a screenshot nothing about what they filtered. */
export function fmtRangeLabel(preset: DatePresetKey, r: DateRange): string {
  const named = DATE_PRESETS.find((p) => p.k === preset);
  if (named) return named.l;
  if (r.from && r.to) return r.from === r.to ? fmtDateShort(r.from) : fmtDateShort(r.from) + ' → ' + fmtDateShort(r.to);
  return 'All time';
}

function fmtDateShort(ds: string): string {
  const d = new Date(ds + 'T00:00');
  if (Number.isNaN(d.getTime())) return ds;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/* `d` may be a date (YYYY-MM-DD) or a timestamp; only the day part is compared,
   so a call logged at 23:50 IST counts on the day the COE made it. A row with
   no date is OUT of any bounded range and IN the unbounded one — it can't be
   claimed for a window nobody can place it in. */
export function inDateRange(d: string | null | undefined, r: DateRange): boolean {
  if (!r.from && !r.to) return true;
  if (!d) return false;
  const day = String(d).slice(0, 10);
  if (r.from && day < r.from) return false;
  if (r.to && day > r.to) return false;
  return true;
}

/* Always re-fetches coe_track AND log immediately before merging, then
   writes both in one PATCH — coe_track can be appended to from more than one
   session, and a stale in-memory copy would silently drop somebody else's
   call. Mirroring into log[] is what makes COE activity visible to the SM,
   Admin and BM without any of them needing to know this table exists. */
export async function patchCoe(orderId: string, mutate: (t: CoeTrack) => CoeTrack, logText: string | null, who: string): Promise<CoeTrack> {
  const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=coe_track,log');
  if (!Array.isArray(rows) || !rows[0]) throw new Error('could not re-read this order');
  const cur: CoeTrack = (rows[0].coe_track && typeof rows[0].coe_track === 'object') ? rows[0].coe_track : {};
  const next = mutate(JSON.parse(JSON.stringify(cur)));
  const body: any = { coe_track: next };
  if (logText) {
    const log = Array.isArray(rows[0].log) ? rows[0].log : [];
    log.push({ t: logText, d: new Date().toISOString(), by: 'manual', who });
    body.log = log;
  }
  await sbPatch('audit_orders', orderId, body);
  return next;
}

export type FollowupRow = { o: CoeOrder; placed: CoeOrderPlaced | null; cps: CheckpointState[]; bucket: BucketKey; nextDue: CheckpointState | null };

/* One pass over the loaded orders — every view reads this, so a row can never
   be counted in one place and filtered differently in another. */
export function followupRows(orders: CoeOrder[], installByPhone: Map<string, CoeInstall[]>): FollowupRow[] {
  const today = todayStr();
  return orders.map((o) => {
    const placed = orderPlacedFor(o, installByPhone);
    const cps = checkpointState(o, placed, today);
    const bucket = bucketFor(o, placed, today);
    const nextDue = cps.filter((c) => c.applies && c.state !== 'done').sort((a, b) => String(a.dueOn || '').localeCompare(String(b.dueOn || '')))[0] || null;
    return { o, placed, cps, bucket, nextDue };
  });
}

export function mapUrl(a: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

/* ── Ratings write (note 117) ────────────────────────────────────────────
   The `ratings` table schema is unchanged — same columns as when the on-site
   job card wrote to it directly — only who writes and when changed.
   staff_email/staff_name is always the field worker who did the job, never
   the COE caller. Used by both the audit D+1 checkpoint (below) and the
   install review tab. */
export type JobRatingInput = {
  orderType: 'audit' | 'install';
  pi: string; orderId: string;
  staffEmail: string | null; staffName: string | null;
  q1: number; q2: number; q3: number; comments: string;
  customerName: string; customerPhone: string;
};
export async function postJobRating(input: JobRatingInput): Promise<void> {
  const body = {
    order_type: input.orderType, pi: input.pi, order_id: input.orderId,
    staff_email: input.staffEmail, staff_name: input.staffName,
    q1_score: input.q1, q2_score: input.q2, q3_score: input.q3,
    comments: input.comments || '', customer_name: input.customerName, customer_phone: input.customerPhone,
  };
  try {
    await sbPost('ratings', body);
  } catch {
    const { q3_score, ...withoutQ3 } = body;
    await sbPost('ratings', withoutQ3);
  }
}

/* ── `ratings` is a PROJECTION of the call log, and it can go missing ───────
   The durable record of a score is the call itself — coe_track.calls[].ratings
   for an audit, subjobs[].coe_review.calls[].ratings for an install. The row in
   `ratings` is a second copy, written straight after the call purely so
   Analytics (here and Admin.html in the sibling repo) can read scores without
   walking two jsonb blobs.

   That second write can fail on its own: the PATCH that saved the call
   succeeded, the POST that projected it didn't. Until 2026-08-25 both call
   forms swallowed exactly that into `console.error`, so the COE saw "Call
   logged", the score sat in the call log, and NPS silently never counted it.
   These helpers close the loop — find the scores that never landed and offer
   to push them — so a failed projection is a visible, fixable backlog instead
   of a permanent hole in the number. */
export const RATING_COLS = 'order_type,order_id,pi,q1_score,q2_score,q3_score,created_at,staff_email';
export type RatingRow = {
  order_type: string; order_id: string | null; pi: string | null;
  q1_score: number | null; q2_score: number | null; q3_score: number | null;
  created_at: string; staff_email: string | null;
};

/* A projection is written seconds after its call, so a generous half-hour is
   already far tighter than the D+1-or-later gap to any on-site legacy rating
   (those were written at signature time, before the COE ever dialled). */
const PROJECTION_WINDOW_MS = 30 * 60 * 1000;

export type ScoredCall = {
  key: string; orderType: 'audit' | 'install'; at: string;
  q1: number; q2: number; q3: number;
  customer: string; staffName: string | null; label: string;
  input: JobRatingInput;
};

/* Every score the COE has ever captured, read from the call logs themselves —
   the source of truth, not the projection. Both tabs' numbers come from here,
   so the COE's own NPS can never disagree with what they typed. */
export function scoredCalls(orders: CoeOrder[], installs: CoeInstall[]): ScoredCall[] {
  const out: ScoredCall[] = [];
  for (const o of orders) {
    for (const c of coeCalls(o)) {
      const r = c.ratings;
      if (!r || !r.q1) continue;
      out.push({
        key: o.id + '|' + c.id, orderType: 'audit', at: c.ts,
        q1: +r.q1, q2: +r.q2, q3: +r.q3,
        customer: o.name || o.pi || '—', staffName: o.auditorName,
        label: 'Site audit · ' + (o.name || o.pi || '—') + (o.auditorName ? ' · audited by ' + o.auditorName : ''),
        input: {
          orderType: 'audit', pi: o.pi, orderId: o.id,
          staffEmail: o.auditorEmail, staffName: o.auditorName,
          q1: +r.q1, q2: +r.q2, q3: +r.q3, comments: c.note || '',
          customerName: o.name, customerPhone: o.phone,
        },
      });
    }
  }
  for (const io of installs) {
    for (const sj of io.subjobs || []) {
      const inst = installPrimaryInstaller(sj);
      for (const c of sj.coe_review?.calls || []) {
        const r = c.ratings;
        if (!r || !r.q1) continue;
        out.push({
          key: io.id + '|' + sj.id + '|' + c.id, orderType: 'install', at: c.ts,
          q1: +r.q1, q2: +r.q2, q3: +r.q3,
          customer: io.name || io.pi || '—', staffName: inst.name,
          label: typeLabel(sj.type) + ' installation · ' + (io.name || io.pi || '—') + (inst.name ? ' · installed by ' + inst.name : ''),
          input: {
            orderType: 'install', pi: io.pi, orderId: String(io.id),
            staffEmail: inst.email, staffName: inst.name,
            q1: +r.q1, q2: +r.q2, q3: +r.q3, comments: c.note || '',
            customerName: io.name, customerPhone: io.phone,
          },
        });
      }
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* Which of those scores never reached `ratings`.

   Two ways a row counts as this call's projection, and both are needed:
     1. same order, written within PROJECTION_WINDOW_MS of the call — the
        normal case, and precise enough that a legacy on-site rating on the
        same order can't be mistaken for it;
     2. same order AND the identical Q1/Q2/Q3 (+ rated staff, when the row
        names one) at any time — a duplicate-suppression guard. Without it, a
        score whose projection landed under a clock skew, or which a previous
        push already fixed, would be offered for pushing again forever.

   Rows are consumed as they match, so two scored calls on one order need two
   rows to both count as projected. */
export function unprojectedScoredCalls(scored: ScoredCall[], ratingRows: RatingRow[]): ScoredCall[] {
  const bucket = new Map<string, RatingRow[]>();
  const keyOf = (type: string, orderId: string | null, pi: string | null) =>
    type + '|' + (orderId ? 'id:' + orderId : 'pi:' + (pi || ''));
  for (const r of ratingRows || []) {
    if (r.order_type !== 'audit' && r.order_type !== 'install') continue;
    // A legacy row with no order_id is only reachable by pi; index it under
    // both so either lookup finds it.
    for (const k of new Set([keyOf(r.order_type, r.order_id, r.pi), keyOf(r.order_type, null, r.pi)])) {
      if (!bucket.has(k)) bucket.set(k, []);
      bucket.get(k)!.push(r);
    }
  }
  const used = new Set<RatingRow>();
  const missing: ScoredCall[] = [];
  // Oldest first, so the earliest call claims the earliest matching row.
  for (const sc of scored.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const cands = [
      ...(bucket.get(keyOf(sc.orderType, sc.input.orderId, sc.input.pi)) || []),
      ...(bucket.get(keyOf(sc.orderType, null, sc.input.pi)) || []),
    ].filter((r) => !used.has(r));
    const ts = new Date(sc.at).getTime();
    const inWindow = cands.filter((r) => Math.abs(new Date(r.created_at).getTime() - ts) <= PROJECTION_WINDOW_MS);
    const staffMatch = (r: RatingRow) => !r.staff_email || !sc.input.staffEmail || r.staff_email === sc.input.staffEmail;
    const hit =
      inWindow.find(staffMatch) ||
      inWindow[0] ||
      cands.find((r) => Number(r.q1_score) === sc.q1 && Number(r.q2_score) === sc.q2 && Number(r.q3_score) === sc.q3 && staffMatch(r));
    if (hit) used.add(hit);
    else missing.push(sc);
  }
  return missing.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* Pushes the missing projections one at a time and reports what happened.
   Sequential on purpose: this runs on a click, the backlog is small by
   construction, and a partial success has to be reported honestly rather than
   collapsed into one thrown error. */
export async function pushScoredCalls(missing: ScoredCall[]): Promise<{ ok: number; failed: Array<{ sc: ScoredCall; message: string }> }> {
  let ok = 0;
  const failed: Array<{ sc: ScoredCall; message: string }> = [];
  for (const sc of missing) {
    try {
      await postJobRating(sc.input);
      ok++;
    } catch (e: any) {
      failed.push({ sc, message: e?.message || 'write failed' });
    }
  }
  return { ok, failed };
}

/* ── Review coverage ───────────────────────────────────────────────────────
   NPS without coverage is unreadable: 20 tens from 200 completed jobs is not
   a +100. `due` counts only reviews whose D+1 has actually arrived (an
   upcoming one is not a miss), `called` counts any logged attempt including
   "didn't pick", and `scored` counts the ones that produced a score. */
export type ReviewProgress = { due: number; called: number; scored: number };
const emptyProgress = (): ReviewProgress => ({ due: 0, called: 0, scored: 0 });

export function auditReviewProgress(rows: FollowupRow[]): ReviewProgress {
  const p = emptyProgress();
  for (const r of rows) {
    const d1 = r.cps.find((c) => c.k === 'd1');
    if (!d1 || !d1.applies) continue;
    // 'pending' is "D+1 hasn't come round yet" — not yet owed, so not a miss.
    if (!(d1.state === 'done' || d1.state === 'overdue' || d1.state === 'due')) continue;
    p.due++;
    if (d1.calls.length) p.called++;
    if (d1.calls.some((c) => c.ratings && c.ratings.q1)) p.scored++;
  }
  return p;
}

export function installReviewProgress(rows: InstallReviewRow[]): ReviewProgress {
  const p = emptyProgress();
  for (const r of rows) {
    if (r.bucket === 'upcoming') continue;
    p.due++;
    const calls = r.sj.coe_review?.calls || [];
    if (calls.length) p.called++;
    if (calls.some((c) => c.ratings && c.ratings.q1)) p.scored++;
  }
  return p;
}

/* ── Install reviews (note 117) — one D+1 checkpoint per COMPLETED SUB-JOB,
   not per order (a mixed order's flooring/wallpaper sub-jobs review
   independently). Calls live inside the sub-job itself
   (subjobs[].coe_review.calls[]) — zero schema change, same technique this
   app already uses for shadower_email. ───────────────────────────────── */

/* The day a sub-job's installation actually completed — scanned from the
   order's own log[], the same way finishInstallation writes it
   (`typeLabel(sj.type) + ' installation completed'`). Latest match wins. */
export function installCompletionDate(order: CoeInstall, sj: CoeSubjob): string | null {
  const prefix = typeLabel(sj.type) + ' installation completed';
  let latest: string | null = null;
  for (const l of order.log || []) {
    if (typeof l?.t === 'string' && l.t.startsWith(prefix) && l.d) {
      const d = String(l.d).slice(0, 10);
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

export function installPrimaryInstaller(sj: CoeSubjob): { email: string | null; name: string | null } {
  const a = sj.assignments?.find((x) => x.primary) || sj.assignments?.[0];
  return { email: a?.installer_email || sj.installer_email || null, name: a?.installer_name || sj.installer || null };
}

export type InstallReviewBucketKey = 'overdue' | 'today' | 'upcoming' | 'done';
export const INSTALL_REVIEW_BUCKETS: Array<{ k: InstallReviewBucketKey; l: string; cls: string }> = [
  { k: 'overdue', l: 'Overdue', cls: 's-red' },
  { k: 'today', l: 'Due today', cls: 's-amber' },
  { k: 'upcoming', l: 'Upcoming', cls: '' },
  { k: 'done', l: 'Reviewed', cls: 's-green' },
];
export type InstallReviewRow = {
  order: CoeInstall; sj: CoeSubjob; completedOn: string; dueOn: string;
  installer: { email: string | null; name: string | null }; bucket: InstallReviewBucketKey;
};

/* One row per completed sub-job across every loaded install order. */
export function installReviewRows(orders: CoeInstall[]): InstallReviewRow[] {
  const today = todayStr();
  const rows: InstallReviewRow[] = [];
  orders.forEach((order) => {
    (order.subjobs || []).forEach((sj) => {
      if (sj.status !== 'completed') return;
      const completedOn = installCompletionDate(order, sj);
      if (!completedOn) return;
      const dueOn = addDays(completedOn, 1);
      const done = !!(sj.coe_review?.calls && sj.coe_review.calls.length);
      const bucket: InstallReviewBucketKey = done ? 'done' : dueOn < today ? 'overdue' : dueOn === today ? 'today' : 'upcoming';
      rows.push({ order, sj, completedOn, dueOn, installer: installPrimaryInstaller(sj), bucket });
    });
  });
  return rows;
}

/* Fresh-fetch-then-append, same discipline as patchCoe — re-reads subjobs/log
   immediately before merging so a second COE session's call is never
   silently clobbered, and mirrors into the order's own log[] so this shows
   up in SM/Admin/BM timelines with zero changes to those views. */
export async function patchInstallReview(
  orderId: string, sjId: string, mutate: (sj: CoeSubjob) => CoeSubjob, logText: string, who: string,
): Promise<void> {
  const rows = await sbGet('install_orders?id=eq.' + orderId + '&select=subjobs,log');
  if (!Array.isArray(rows) || !rows[0]) throw new Error('could not re-read this order');
  const subjobs: CoeSubjob[] = Array.isArray(rows[0].subjobs) ? rows[0].subjobs : [];
  const idx = subjobs.findIndex((s) => s.id === sjId);
  if (idx === -1) throw new Error('sub-job not found');
  subjobs[idx] = mutate(JSON.parse(JSON.stringify(subjobs[idx])));
  const log = Array.isArray(rows[0].log) ? rows[0].log : [];
  log.push({ t: logText, d: new Date().toISOString(), by: 'manual', who });
  await sbPatch('install_orders', orderId, { subjobs, log });
}

/* ── Custom wallpaper production writes ─────────────────────────────────── */

/* Same fresh-fetch-then-merge-then-patch discipline as the follow-up writes:
   re-read the row immediately before merging so a second COE session's stamp
   is never silently clobbered. */
export async function patchWp(row: WpRow, mutate: (cur: WpRow) => WpRow, logText: string, who: string): Promise<WpRow> {
  const rows = await sbGet('wp_production?id=eq.' + row.id + '&select=*');
  if (!Array.isArray(rows) || !rows[0]) throw new Error('could not re-read this order');
  const cur: WpRow = JSON.parse(JSON.stringify(rows[0]));
  const next = mutate(cur);
  const log = Array.isArray(next.log) ? next.log : [];
  if (logText) log.push({ t: logText, d: new Date().toISOString(), by: 'manual', who });
  const body: any = {
    stages: next.stages || {}, rounds: next.rounds || [], state: next.state || 'active', notes: next.notes || '', log,
    customer_name: next.customer_name || null, phone: next.phone || null, bm: next.bm || null,
  };
  await sbPatch('wp_production', row.id, body);
  return { ...row, ...body };
}

/* Stamps one stage. Round stages write into the current round; a "redo" (the
   client asked for changes) opens a NEW round rather than overwriting the
   last one, so every render cycle keeps its own timestamps — which is the
   whole reason per-round delay analysis is possible. */
export async function stampWpStage(row: WpRow, next: WpNext, opts: { note: string; decision?: string | null }, who: string): Promise<WpRow> {
  const stamp = { at: new Date().toISOString(), by: { name: who }, note: opts.note || '' };
  const label = wpStageLabel(next.k, row.vendor);
  const logText = label + (opts.note ? ' — ' + opts.note : '') + (opts.decision ? ' [' + opts.decision + ']' : '')
    + (next.redo ? ' (round ' + (wpRounds(row).length + 1) + ')' : '');
  return patchWp(row, (cur) => {
    cur.stages = (cur.stages && typeof cur.stages === 'object') ? cur.stages : {};
    cur.rounds = Array.isArray(cur.rounds) && cur.rounds.length ? cur.rounds : [{ n: 1 }];
    if (WP_ROUND_KEYS.includes(next.k)) {
      if (next.redo) cur.rounds.push({ n: cur.rounds.length + 1 });
      const round: any = cur.rounds[cur.rounds.length - 1];
      if (next.k === 'client_approval') {
        round.approval = { ...stamp, decision: (opts.decision || 'approved') as any };
        if (opts.decision === 'cancelled') cur.state = 'cancelled';
      } else {
        round[next.k] = stamp;
      }
    } else {
      (cur.stages as any)[next.k] = stamp;
    }
    return cur;
  }, logText, who);
}

export type NewWpRow = {
  pi: string; md_id: string; vendor: string; customer_name: string; phone: string; bm: string;
  notes: string; order_placed_at: string; install_order_id: string | null; city: string | null;
};
export async function createWpRow(input: NewWpRow, who: string): Promise<any> {
  const body: any = {
    pi: input.pi, md_id: input.md_id, vendor: input.vendor,
    customer_name: input.customer_name, phone: input.phone, bm: input.bm, notes: input.notes,
    order_placed_at: input.order_placed_at, stages: {}, rounds: [{ n: 1 }], state: 'active',
    install_order_id: input.install_order_id,
    log: [{ t: 'Production tracking started', d: new Date().toISOString(), by: 'manual', who }],
  };
  if (input.city) body.city = input.city;
  const made = await sbPost('wp_production', body);
  return Array.isArray(made) ? made[0] : made;
}

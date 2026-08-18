/* Category Ops Executive — follow-up queue logic, TS port of
   material-depot-site's COE_Dashboard.html (site-audit → order conversion
   call queue). See CLAUDE.md note 102 in that repo for the full spec. */

import { phoneKey, sbGet, sbPatch, sbPost } from '../siteAuditShared';
import { WP_ROUND_KEYS, wpRounds, wpStageLabel, type WpNext, type WpRow } from './wpTrack';

export type CoeCall = { id: string; ts: string; stage: string; who: string; outcome: string; note: string; by?: { email?: string; name?: string } };
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
  date: string | null; auditorName: string | null; createdAt: string | null;
  city: string | null; coeTrack: CoeTrack;
};
export type CoeInstall = { id: string; pi: string; po: string[]; phone: string; name: string; createdAt: string | null; status: string; customWp: boolean; deliveryDate: string | null };

/* `log` is deliberately NOT here. It is jsonb averaging ~7 KB a row — on the
   completed-audit set that is 1.8 MB of the ~1.9 MB this view re-fetches every
   30 seconds — and it is read in exactly one place, the drawer's "Order
   timeline", for one order at a time. It is fetched per order on open instead
   (loadOrderLog below). patchCoe re-reads it before every write regardless, so
   nothing that mutates the log depends on the list carrying it. */
export const AUDIT_COLS = 'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_name,created_at,city,coe_track';
export const INSTALL_COLS = 'id,pi,po,phone,customer_name,created_at,status,custom_wp,delivery_date';

export function mapCoeAudit(r: any): CoeOrder {
  return {
    id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    skus: r.skus || [], bm: r.bm || '—', bmEmail: r.bm_email || null,
    name: r.customer_name || '', phone: r.phone || '', addr: r.addr || '',
    status: r.status || 'pending', service: r.service || null, slot: r.slot || null, date: r.date || null,
    auditorName: r.auditor_name || null, createdAt: r.created_at || null,
    city: r.city || null, coeTrack: (r.coe_track && typeof r.coe_track === 'object') ? r.coe_track : {},
  };
}
export function mapCoeInstall(r: any): CoeInstall {
  return {
    id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    phone: r.phone || '', name: r.customer_name || '', createdAt: r.created_at || null,
    status: r.status || '', customWp: !!r.custom_wp, deliveryDate: r.delivery_date || null,
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

export type Category = { l: string; c: string };

/* Category labels, derived from service{} first (set when the SM creates the
   service) and falling back to SKU codes. audit_ticked is deliberately never
   fetched here — it carries job-card photos on completed orders. */
export function categoriesFor(o: CoeOrder): Category[] {
  const out: Category[] = [];
  const svc = o.service || {};
  if (Array.isArray(svc.flooring) && svc.flooring.length) out.push({ l: 'Flooring', c: '' });
  if (Array.isArray(svc.wallpaper) && svc.wallpaper.length) out.push({ l: 'Wallpaper', c: 'wp' });
  const codes = (o.skus || []).filter((s: any) => !s.audit).map((s: any) => String(s.c || '').toUpperCase()).join(' ');
  if (/CWP-|CUSTOM/.test(codes) && !out.some((x) => x.c === 'cwp')) out.push({ l: 'Custom WP', c: 'cwp' });
  if (!out.length) {
    if (/WF-|FLOOR/.test(codes)) out.push({ l: 'Flooring', c: '' });
    if (/WP-|WALL/.test(codes)) out.push({ l: 'Wallpaper', c: 'wp' });
  }
  return out;
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

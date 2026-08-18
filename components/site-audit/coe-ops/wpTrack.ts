/* Custom-wallpaper production registry — TS port of material-depot-site's
   shared md-wp-track.js. Single source of truth for the vendor list, the
   stage ladder and the SLA maths behind the Category Ops Executive's
   wp_production tracking.

   ADDING A VENDOR = one object in WP_VENDORS. Nothing else changes. */

export type WpVendor = { k: string; label: string; dispatchFrom: string; note?: string };

export const WP_VENDORS: WpVendor[] = [
  { k: 'indura', label: 'Indura', dispatchFrom: 'Hyderabad' },
  { k: 'lifencolor', label: 'Life n Color', dispatchFrom: 'Gurugram' },
  { k: 'macromedia', label: 'Macro Media', dispatchFrom: 'Hyderabad', note: '1 PM cutoff for same-day pickup' },
  { k: 'other', label: 'Other vendor', dispatchFrom: 'vendor' },
];

/* group    — which phase of the journey this belongs to (drives the bucket tiles)
   slaH     — hours allowed since the PREVIOUS stage was stamped. OPTIONAL, and
              deliberately absent from the back six: those come from the vendor
              sheet's own bracketed headers only for the first five (6h/6h/2h/2h/1day),
              which are Material Depot's real targets. Everything from printing
              onwards is MEASURED, not policed — the Category Ops Executive is
              recording how long each step actually takes, and attaching an
              invented target there would manufacture "delays" that mean nothing.
   soft     — only meaningful alongside slaH: true = an attention threshold
              ("stalled"), false = a promised SLA ("breached").
   round    — lives inside a render/approval round rather than the linear stage map
   decision — captures the client's verdict, which is what can send it round again */
export type WpStage = { k: string; label: string; group: string; slaH?: number; soft?: boolean; round?: boolean; decision?: boolean };

export const WP_STAGES: WpStage[] = [
  { k: 'dimensions_shared', label: 'Dimensions shared with vendor', group: 'prepress', slaH: 6 },
  { k: 'render_generated', label: 'Render generated', group: 'prepress', slaH: 6, round: true },
  { k: 'render_to_bm', label: 'Render shared with BM', group: 'prepress', slaH: 2, round: true },
  { k: 'render_to_client', label: 'Shared with client by BM', group: 'prepress', slaH: 2, round: true },
  { k: 'client_approval', label: 'Approved by client', group: 'approval', slaH: 24, round: true, decision: true },
  // No slaH from here on — measured, not policed. See the note above.
  { k: 'sent_for_printing', label: 'Sent for printing', group: 'production' },
  { k: 'dispatched', label: 'Dispatched from {from}', group: 'production' },
  { k: 'at_warehouse', label: 'Reached our warehouse', group: 'logistics' },
  { k: 'out_for_delivery', label: 'Out for delivery', group: 'logistics' },
  { k: 'delivered', label: 'Delivered to client', group: 'logistics' },
  { k: 'install_scheduled', label: 'Installation scheduled', group: 'logistics' },
];

export type WpDecisionKey = 'approved' | 'changes_suggested' | 'no_reply' | 'cancelled';
export const WP_DECISIONS: Array<{ k: WpDecisionKey; l: string; terminalOk?: boolean; loops?: boolean; cancels?: boolean }> = [
  { k: 'approved', l: 'Approved by client', terminalOk: true },
  { k: 'changes_suggested', l: 'Changes suggested', loops: true },
  { k: 'no_reply', l: 'No reply from client' },
  { k: 'cancelled', l: 'PO cancelled', cancels: true },
];

export const WP_ROUND_KEYS = ['render_generated', 'render_to_bm', 'render_to_client', 'client_approval'];

export type WpRound = {
  n: number;
  render_generated?: { at: string; by?: { email?: string; name?: string }; note?: string };
  render_to_bm?: { at: string; by?: { email?: string; name?: string }; note?: string };
  render_to_client?: { at: string; by?: { email?: string; name?: string }; note?: string };
  approval?: { at: string; by?: { email?: string; name?: string }; note?: string; decision?: WpDecisionKey };
};

export type WpRow = {
  id: string; pi: string; md_id: string; vendor: string; city?: string | null;
  customer_name: string | null; phone: string | null; bm: string | null; bm_email?: string | null;
  order_placed_at: string | null; created_at?: string | null;
  stages: Record<string, { at: string; by?: { email?: string; name?: string }; note?: string }>;
  rounds: WpRound[];
  state: 'active' | 'done' | 'cancelled' | 'on_hold';
  notes: string; install_order_id?: string | null; audit_order_id?: string | null;
  imported?: boolean; log: Array<{ t: string; d: string; by?: string; who?: string }>;
};

export function wpVendor(k?: string | null): WpVendor {
  return WP_VENDORS.find((v) => v.k === k) || { k: k || 'other', label: k || 'Unknown vendor', dispatchFrom: 'vendor' };
}
export function wpStage(k: string): WpStage {
  return WP_STAGES.find((s) => s.k === k) || { k, label: k, group: 'logistics' };
}
export function wpStageLabel(k: string, vendorKey?: string | null): string {
  return wpStage(k).label.replace('{from}', wpVendor(vendorKey).dispatchFrom);
}

/* Rounds always read as at least one, so a brand-new row renders the full
   ladder instead of an empty gap where the render cycle should be. */
export function wpRounds(row: WpRow): WpRound[] {
  const r = Array.isArray(row?.rounds) ? row.rounds : [];
  return r.length ? r : [{ n: 1 }];
}
function stagesOf(row: WpRow) {
  return (row && row.stages && typeof row.stages === 'object') ? row.stages : {};
}

/* Timestamp for a stage. Round stages resolve against the CURRENT (latest)
   round — earlier rounds keep their own timestamps and are shown separately
   in the ladder. */
export function wpStageAt(row: WpRow, k: string): string | null {
  if (WP_ROUND_KEYS.includes(k)) {
    const rs = wpRounds(row);
    const cur = rs[rs.length - 1] || {};
    if (k === 'client_approval') return cur.approval?.at || null;
    return (cur as any)[k]?.at || null;
  }
  return stagesOf(row)[k]?.at || null;
}

export function wpDecision(row: WpRow): WpDecisionKey | null {
  const rs = wpRounds(row);
  const cur = rs[rs.length - 1] || {};
  return cur.approval?.decision || null;
}

export type WpNext = { k: string; label: string; group: string; redo: boolean };

/* What has to happen next. Returns null when the row has nothing left to do.
   The one place the loop lives: "changes suggested" means the NEXT action is
   a fresh render (a new round), while "no reply" means keep chasing the same
   approval. */
export function wpNext(row: WpRow | null | undefined): WpNext | null {
  if (!row || row.state === 'cancelled') return null;
  const at = (k: string) => wpStageAt(row, k);
  const mk = (k: string, redo?: boolean): WpNext => {
    const s = wpStage(k);
    return { k, label: wpStageLabel(k, row.vendor), group: s.group, redo: !!redo };
  };
  if (!at('dimensions_shared')) return mk('dimensions_shared');
  for (const k of WP_ROUND_KEYS) if (!at(k)) return mk(k);
  const d = wpDecision(row);
  if (d === 'cancelled') return null;
  if (d === 'changes_suggested') return mk('render_generated', true);
  if (d === 'no_reply') return mk('client_approval', true);
  if (d !== 'approved') return mk('client_approval', true);
  const tail = ['sent_for_printing', 'dispatched', 'at_warehouse', 'out_for_delivery', 'delivered', 'install_scheduled'];
  for (const k of tail) if (!at(k)) return mk(k);
  return null;
}

/* Elapsed is measured from the moment the PREVIOUS stage was stamped (or from
   the order being placed, for the very first stage) — the same way the
   vendor sheet's bracketed hour targets read. Wall-clock, not business hours. */
export function wpPrevAt(row: WpRow): string | null {
  const next = wpNext(row);
  if (!next) return null;
  const order = WP_STAGES.map((s) => s.k);
  const idx = order.indexOf(next.k);
  // A redo (new round after "changes suggested") clocks from the client's
  // feedback, not from the previous round's render — that's when the work
  // actually restarted.
  if (next.redo) {
    const rs = wpRounds(row);
    const cur = rs[rs.length - 1] || {};
    if (cur.approval?.at) return cur.approval.at;
  }
  for (let i = idx - 1; i >= 0; i--) {
    const a = wpStageAt(row, WP_STAGES[i].k);
    if (a) return a;
  }
  return row.order_placed_at || row.created_at || null;
}

export type WpSla = { level: 'none' | 'ok' | 'soon' | 'stalled' | 'breach'; next: WpNext | null; hours: number; from?: string | null; slaH?: number | null; soft?: boolean; imported?: boolean };

export function wpSla(row: WpRow, nowMs?: number): WpSla {
  const next = wpNext(row);
  if (!next) return { level: 'none', next: null, hours: 0 };
  const s = wpStage(next.k);
  const from = wpPrevAt(row);
  if (!from) return { level: 'none', next, hours: 0, from: null };
  // An imported row's "previous step" timestamp is the order date, not when
  // that step actually finished — so a breach/stalled verdict off it would be
  // invented precision. Report the real elapsed time since the order was
  // placed, but never colour it as a missed target.
  if (row.imported) {
    return { level: 'none', next, imported: true, from, slaH: s.slaH || null, hours: ((nowMs || Date.now()) - new Date(from).getTime()) / 3600000 };
  }
  const hours = ((nowMs || Date.now()) - new Date(from).getTime()) / 3600000;
  // No target on this stage = no verdict. 'none' rather than 'ok', because
  // calling a step "on track" against a target that doesn't exist is just as
  // invented as calling it late. The elapsed hours are still returned.
  let level: WpSla['level'] = 'none';
  if (s.slaH) {
    level = 'ok';
    if (hours > s.slaH) level = s.soft ? 'stalled' : 'breach';
    else if (hours >= s.slaH * 0.75) level = 'soon';
  }
  return { level, next, hours, from, slaH: s.slaH || null, soft: !!s.soft };
}

export type WpBucketKey = 'breach' | 'prepress' | 'approval' | 'production' | 'logistics' | 'onhold' | 'completed' | 'cancelled';

/* Bucket for the stat tiles. Mutually exclusive and exhaustive, so the tiles
   always sum to the row count. */
export function wpBucket(row: WpRow, nowMs?: number): WpBucketKey {
  if (row?.state === 'cancelled') return 'cancelled';
  const next = wpNext(row);
  if (!next) return 'completed';
  if (row?.state === 'on_hold') return 'onhold';
  const sla = wpSla(row, nowMs);
  if (sla.level === 'breach' || sla.level === 'stalled') return 'breach';
  return next.group as WpBucketKey;
}

export const WP_BUCKETS: Array<{ k: WpBucketKey; l: string; cls: string }> = [
  { k: 'breach', l: 'Delayed / breached', cls: 's-red' },
  { k: 'prepress', l: 'Render in progress', cls: '' },
  { k: 'approval', l: 'Awaiting client', cls: 's-amber' },
  { k: 'production', l: 'Printing & dispatch', cls: '' },
  { k: 'logistics', l: 'Delivery & install', cls: '' },
  { k: 'onhold', l: 'On hold', cls: '' },
  { k: 'completed', l: 'Completed', cls: 's-green' },
  { k: 'cancelled', l: 'Cancelled', cls: '' },
];

export type WpDuration = { k: string; hours: number; round: number | null; vendor: string };

/* One entry per stage that actually happened, with the hours it took from
   whatever legitimately preceded it. EVERY render round contributes its own
   data points — a job that took three renders is three observations of "how
   long a render takes," not one. */
export function wpDurations(row: WpRow | null | undefined): WpDuration[] {
  if (!row) return [];
  // Rows imported from the vendor spreadsheets carry no real per-step
  // timestamps — the sheet only ever recorded Yes/No ticks — so every stage
  // was stamped with the order-placed date. Letting those through would
  // produce a wall of fake "0 hrs" observations and quietly wreck the
  // medians. They still count in the funnels (which step did it reach).
  if (row.imported) return [];
  const out: WpDuration[] = [];
  const vendor = row.vendor || 'other';
  const rounds = wpRounds(row);
  const st = stagesOf(row);
  const start = row.order_placed_at || row.created_at || null;
  function push(k: string, at: string | null | undefined, prev: string | null | undefined, n?: number) {
    if (!at || !prev) return;
    const h = (new Date(at).getTime() - new Date(prev).getTime()) / 3600000;
    if (!isFinite(h) || h < 0) return; // out-of-order/backfilled data — skip, never negative
    out.push({ k, hours: h, round: n || null, vendor });
  }
  push('dimensions_shared', st.dimensions_shared?.at, start);
  const prevChain = st.dimensions_shared?.at || start;
  rounds.forEach((r, i) => {
    const base = i === 0 ? prevChain : (rounds[i - 1].approval?.at || null);
    const rg = r.render_generated?.at;
    const rb = r.render_to_bm?.at;
    const rc = r.render_to_client?.at;
    const ap = r.approval?.at;
    push('render_generated', rg, base, i + 1);
    push('render_to_bm', rb, rg, i + 1);
    push('render_to_client', rc, rb, i + 1);
    push('client_approval', ap, rc, i + 1);
  });
  const last = rounds[rounds.length - 1] || {};
  let prev = last.approval?.at || null;
  for (const k of ['sent_for_printing', 'dispatched', 'at_warehouse', 'out_for_delivery', 'delivered', 'install_scheduled']) {
    const at = st[k]?.at;
    push(k, at, prev);
    if (at) prev = at;
  }
  return out;
}

export function wpFmtDur(h: number | null | undefined): string {
  if (h == null) return '';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min';
  if (h < 48) return Math.round(h * 10) / 10 + ' hrs';
  return Math.round(h / 24) + ' days';
}

/* A row that's already past a step counts as having reached it, even if that
   specific step was never explicitly stamped — otherwise a back-filled row
   makes the funnel look like it skipped a stage it demonstrably went through. */
export function wpEverReached(row: WpRow, k: string): boolean {
  const order = WP_STAGES.map((s) => s.k);
  const idx = order.indexOf(k);
  for (let i = order.length - 1; i > idx; i--) {
    if (wpStageAt(row, order[i])) return true;
  }
  return false;
}

type WpVendor = { k: string; label: string; dispatchFrom: string; note?: string };

export const WP_VENDORS: WpVendor[] = [
  { k: 'indura', label: 'Indura', dispatchFrom: 'Hyderabad' },
  { k: 'lifencolor', label: 'Life n Color', dispatchFrom: 'Gurugram' },
  { k: 'macromedia', label: 'Macro Media', dispatchFrom: 'Hyderabad', note: '1 PM cutoff for same-day pickup' },
  { k: 'other', label: 'Other vendor', dispatchFrom: 'vendor' },
];

type WpStage = { k: string; label: string; group: string; slaH?: number; soft?: boolean; round?: boolean; decision?: boolean };

export const WP_STAGES: WpStage[] = [
  { k: 'dimensions_shared', label: 'Dimensions shared with vendor', group: 'prepress', slaH: 6 },
  { k: 'render_generated', label: 'Render generated', group: 'prepress', slaH: 6, round: true },
  { k: 'render_to_bm', label: 'Render shared with BM', group: 'prepress', slaH: 2, round: true },
  { k: 'render_to_client', label: 'Shared with client by BM', group: 'prepress', slaH: 2, round: true },
  { k: 'client_approval', label: 'Approved by client', group: 'approval', slaH: 24, round: true, decision: true },

  { k: 'sent_for_printing', label: 'Sent for printing', group: 'production' },
  { k: 'dispatched', label: 'Dispatched from {from}', group: 'production' },
  { k: 'at_warehouse', label: 'Reached our warehouse', group: 'logistics' },
  { k: 'out_for_delivery', label: 'Out for delivery', group: 'logistics' },
  { k: 'delivered', label: 'Delivered to client', group: 'logistics' },
  { k: 'install_scheduled', label: 'Installation scheduled', group: 'logistics' },
];

type WpDecisionKey = 'approved' | 'changes_suggested' | 'no_reply' | 'cancelled';
export const WP_DECISIONS: Array<{ k: WpDecisionKey; l: string; terminalOk?: boolean; loops?: boolean; cancels?: boolean }> = [
  { k: 'approved', l: 'Approved by client', terminalOk: true },
  { k: 'changes_suggested', l: 'Changes suggested', loops: true },
  { k: 'no_reply', l: 'No reply from client' },
  { k: 'cancelled', l: 'PO cancelled', cancels: true },
];

export const WP_ROUND_KEYS = ['render_generated', 'render_to_bm', 'render_to_client', 'client_approval'];

type WpRound = {
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
function wpStage(k: string): WpStage {
  return WP_STAGES.find((s) => s.k === k) || { k, label: k, group: 'logistics' };
}
export function wpStageLabel(k: string, vendorKey?: string | null): string {
  return wpStage(k).label.replace('{from}', wpVendor(vendorKey).dispatchFrom);
}

export function wpRounds(row: WpRow): WpRound[] {
  const r = Array.isArray(row?.rounds) ? row.rounds : [];
  return r.length ? r : [{ n: 1 }];
}
function stagesOf(row: WpRow) {
  return (row && row.stages && typeof row.stages === 'object') ? row.stages : {};
}

export function wpStageAt(row: WpRow, k: string): string | null {
  if (WP_ROUND_KEYS.includes(k)) {
    const rs = wpRounds(row);
    const cur = rs[rs.length - 1] || {};
    if (k === 'client_approval') return cur.approval?.at || null;
    return (cur as any)[k]?.at || null;
  }
  return stagesOf(row)[k]?.at || null;
}

function wpDecision(row: WpRow): WpDecisionKey | null {
  const rs = wpRounds(row);
  const cur = rs[rs.length - 1] || {};
  return cur.approval?.decision || null;
}

export type WpNext = { k: string; label: string; group: string; redo: boolean };

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

function wpPrevAt(row: WpRow): string | null {
  const next = wpNext(row);
  if (!next) return null;
  const order = WP_STAGES.map((s) => s.k);
  const idx = order.indexOf(next.k);

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

  if (row.imported) {
    return { level: 'none', next, imported: true, from, slaH: s.slaH || null, hours: ((nowMs || Date.now()) - new Date(from).getTime()) / 3600000 };
  }
  const hours = ((nowMs || Date.now()) - new Date(from).getTime()) / 3600000;

  let level: WpSla['level'] = 'none';
  if (s.slaH) {
    level = 'ok';
    if (hours > s.slaH) level = s.soft ? 'stalled' : 'breach';
    else if (hours >= s.slaH * 0.75) level = 'soon';
  }
  return { level, next, hours, from, slaH: s.slaH || null, soft: !!s.soft };
}

export type WpBucketKey = 'breach' | 'prepress' | 'approval' | 'production' | 'logistics' | 'onhold' | 'completed' | 'cancelled';

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

type WpDuration = { k: string; hours: number; round: number | null; vendor: string };

export function wpDurations(row: WpRow | null | undefined): WpDuration[] {
  if (!row) return [];

  if (row.imported) return [];
  const out: WpDuration[] = [];
  const vendor = row.vendor || 'other';
  const rounds = wpRounds(row);
  const st = stagesOf(row);
  const start = row.order_placed_at || row.created_at || null;
  function push(k: string, at: string | null | undefined, prev: string | null | undefined, n?: number) {
    if (!at || !prev) return;
    const h = (new Date(at).getTime() - new Date(prev).getTime()) / 3600000;
    if (!isFinite(h) || h < 0) return;
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

export function wpEverReached(row: WpRow, k: string): boolean {
  const order = WP_STAGES.map((s) => s.k);
  const idx = order.indexOf(k);
  for (let i = order.length - 1; i > idx; i--) {
    if (wpStageAt(row, order[i])) return true;
  }
  return false;
}

'use client';

import { fetchCRMLeads, type CRMLeadRow } from '@/lib/mockApi';
import { phoneKey } from '../siteAuditShared';

const DEAL_PIPELINE = [
  'In Cart',
  'Quote Approval Pending',
  'Availability Check',
  'Hold Stock',
  'Order Placed',
  'Order Confirmed',
  'Partly Shipped',
  'Shipped',
  'Partly Delivered',
  'Delivered',
];

const DEAL_LOST = new Set(['Refunded', 'Order Lost', 'Order Cancelled']);

function dealRank(status: string | null | undefined): number {
  const i = DEAL_PIPELINE.indexOf(String(status || ''));
  return i;
}
const RANK_QUOTE = DEAL_PIPELINE.indexOf('Quote Approval Pending');
const RANK_ORDER = DEAL_PIPELINE.indexOf('Order Placed');

export type FunnelStepKey =
  | 'audit_done' | 'cart_created' | 'quote_shared' | 'order_placed' | 'install_ordered' | 'installed';

export type FunnelStepDef = { k: FunnelStepKey; label: string; short: string; hint: string };

export const FUNNEL_STEPS: FunnelStepDef[] = [
  { k: 'audit_done', label: 'Site audit completed', short: 'Audit', hint: 'The auditor finished the visit and signed off the job card.' },
  { k: 'cart_created', label: 'Cart created', short: 'Cart', hint: 'A deal exists in the CRM for this client, raised on or after the audit.' },
  { k: 'quote_shared', label: 'Quotation shared', short: 'Quote', hint: 'The cart reached quote approval — the estimate has gone to the client.' },
  { k: 'order_placed', label: 'Order placed', short: 'Order', hint: 'The client confirmed the order.' },
  { k: 'install_ordered', label: 'Installation ordered', short: 'Install order', hint: 'An installation service order was raised for this client after the audit.' },
  { k: 'installed', label: 'Installation completed', short: 'Installed', hint: 'The installer finished the job on site.' },
];

export type FunnelState =

  | 'done'
  /* a LATER step is done, so this one must have happened, but nothing on this
     side records it — almost always a cart raised under a different phone
     number. Shown as reached, flagged as unrecorded, never counted as a stall. */
  | 'implied'
  /* the source that would answer this couldn't be read. NOT the same as
     'pending': reporting an unreadable pipeline as "no cart yet" is the one
     mistake that would send a BM to chase a client who has already ordered,
     and it would inflate the "waiting on cart" count on every dashboard the
     moment Django went quiet. */
  | 'unknown'
  /* not reached */
  | 'pending';

export type FunnelStep = FunnelStepDef & {
  state: FunnelState;
  at: string | null;
  ref: string;
  detail: string;
};

export type Funnel = {
  steps: FunnelStep[];

  furthest: FunnelStepKey;

  stalledAt: FunnelStepDef | null;

  unknownFrom: FunnelStepDef | null;

  lost: { status: string; reason: string; at: string; ref: string } | null;

  priorDeals: number;

  value: number;

  pipelineKnown: boolean;
};

export type FunnelInput = {

  auditDate: string | null;
  auditCompleted: boolean;
  auditCompletedAt: string | null;

  deals: CRMLeadRow[] | null;

  install: { pi: string; createdAt: string | null; status: string } | null;

  wpRun: { pi: string; placedAt: string | null } | null;

  declaredOrderAt: string | null;
  declaredOrderRef: string;
};

function dayOf(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : '';
}

function scopeDeals(deals: CRMLeadRow[], auditDate: string | null): CRMLeadRow[] {
  const anchor = dayOf(auditDate);
  const scoped = anchor ? deals.filter((d) => dayOf(d.createdAt) >= anchor) : deals;
  return scoped.slice().sort((a, b) => dealRank(b.status) - dealRank(a.status));
}

export function funnelFor(input: FunnelInput): Funnel {
  const pipelineKnown = Array.isArray(input.deals);
  const all = input.deals || [];
  const scoped = scopeDeals(all, input.auditDate);
  const anchor = dayOf(input.auditDate);
  const priorDeals = anchor ? all.filter((d) => dayOf(d.createdAt) < anchor).length : 0;

  const ranked = scoped.filter((d) => dealRank(d.status) >= 0);
  const best = ranked[0] || null;
  const bestRank = best ? dealRank(best.status) : -1;

  const anyDeal = scoped[0] || null;
  const lostDeal = scoped.find((d) => DEAL_LOST.has(String(d.status || ''))) || null;

  const installOrderedAt = input.install?.createdAt || null;
  const installedAt = input.install && input.install.status === 'completed' ? input.install.createdAt : null;

  const orderEvidence: Array<{ at: string | null; ref: string; detail: string }> = [];
  if (input.declaredOrderAt) orderEvidence.push({ at: input.declaredOrderAt, ref: input.declaredOrderRef, detail: 'Recorded by the team' });
  if (bestRank >= RANK_ORDER && best) orderEvidence.push({ at: best.createdAt || null, ref: best.id || '', detail: 'CRM deal · ' + best.status });
  if (input.wpRun) orderEvidence.push({ at: input.wpRun.placedAt, ref: input.wpRun.pi, detail: 'Custom wallpaper in production' });
  if (input.install) orderEvidence.push({ at: installOrderedAt, ref: input.install.pi, detail: 'Installation order raised' });
  const order = orderEvidence[0] || null;

  const raw: Record<FunnelStepKey, { at: string | null; ref: string; detail: string } | null> = {
    audit_done: input.auditCompleted ? { at: input.auditCompletedAt || input.auditDate, ref: '', detail: 'Job card signed off' } : null,
    cart_created: anyDeal ? { at: anyDeal.createdAt || null, ref: anyDeal.id || '', detail: 'CRM deal · ' + anyDeal.status } : null,
    quote_shared: best && bestRank >= RANK_QUOTE ? { at: best.createdAt || null, ref: best.id || '', detail: 'Reached ' + best.status } : null,
    order_placed: order,
    install_ordered: input.install ? { at: installOrderedAt, ref: input.install.pi, detail: 'Service order ' + input.install.pi } : null,

    installed: input.install && input.install.status === 'completed'
      ? { at: installedAt, ref: input.install.pi, detail: 'Installation completed' }
      : null,
  };

  const lastDone = FUNNEL_STEPS.reduce((acc, s, i) => (raw[s.k] ? i : acc), -1);

  const steps: FunnelStep[] = FUNNEL_STEPS.map((def, i) => {
    const hit = raw[def.k];
    if (hit) return { ...def, state: 'done' as FunnelState, at: hit.at, ref: hit.ref, detail: hit.detail };
    if (i < lastDone) {
      return {
        ...def, state: 'implied' as FunnelState, at: null, ref: '',
        detail: def.k === 'cart_created' || def.k === 'quote_shared'
          ? 'Not visible in the CRM pipeline — the cart may be under a different number'
          : 'Not recorded, but a later step is done',
      };
    }

    if (!pipelineKnown && (def.k === 'cart_created' || def.k === 'quote_shared' || def.k === 'order_placed')) {
      return { ...def, state: 'unknown' as FunnelState, at: null, ref: '', detail: "Couldn't read the CRM pipeline — unknown, not absent" };
    }
    return { ...def, state: 'pending' as FunnelState, at: null, ref: '', detail: '' };
  });

  const firstOpen = steps.find((s) => s.state === 'pending' || s.state === 'unknown') || null;
  const stalledAt = firstOpen && firstOpen.state === 'pending' ? firstOpen : null;
  const unknownFrom = firstOpen && firstOpen.state === 'unknown' ? firstOpen : null;
  const asDef = (s: FunnelStep | null): FunnelStepDef | null => (s ? { k: s.k, label: s.label, short: s.short, hint: s.hint } : null);

  return {
    steps,
    furthest: (lastDone >= 0 ? FUNNEL_STEPS[lastDone].k : 'audit_done'),
    stalledAt: asDef(stalledAt),
    unknownFrom: asDef(unknownFrom),

    lost: lostDeal && !best && !raw.order_placed
      ? {
        status: String(lostDeal.status || ''),
        reason: lostDeal.lostReason || '',
        at: lostDeal.lostMarkDate || lostDeal.closureDate || '',
        ref: lostDeal.id || '',
      }
      : null,
    priorDeals,
    value: scoped.reduce((s, d) => s + (Number(d.cartValue) || 0), 0),
    pipelineKnown,
  };
}

const dealCache = new Map<string, CRMLeadRow[]>();
const CONCURRENCY = 4;

export const FUNNEL_PHONE_CAP = 80;

export type DealsResult = {

  byPhone: Map<string, CRMLeadRow[] | null>;

  skipped: number;

  allFailed: boolean;
};

export async function loadDealsForPhones(phones: (string | null | undefined)[]): Promise<DealsResult> {
  const wanted = [...new Set(phones.map((p) => phoneKey(p)).filter((k) => k.length === 10))];
  const byPhone = new Map<string, CRMLeadRow[] | null>();
  const missing: string[] = [];
  for (const k of wanted) {
    if (dealCache.has(k)) byPhone.set(k, dealCache.get(k)!);
    else missing.push(k);
  }
  const take = missing.slice(0, FUNNEL_PHONE_CAP);
  const skipped = missing.length - take.length;
  if (!take.length) return { byPhone, skipped, allFailed: false };

  let ok = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= take.length) return;
      const key = take[i];
      try {
        const { results } = await fetchCRMLeads({ q: key, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' });

        const mine = (results || []).filter((r) => phoneKey(r.clientPhone) === key);
        dealCache.set(key, mine);
        byPhone.set(key, mine);
        ok++;
      } catch {

        byPhone.set(key, null);
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, take.length) }, worker));
  return { byPhone, skipped, allFailed: ok === 0 && failed > 0 };
}

export function forgetDeals(phone: string | null | undefined): void {
  const k = phoneKey(phone);
  if (k) dealCache.delete(k);
}

export const FUNNEL_BADGE: Record<FunnelStepKey, string> = {
  audit_done: 'bg-gray-100 text-gray-600',
  cart_created: 'bg-indigo-100 text-indigo-700',
  quote_shared: 'bg-amber-100 text-amber-800',
  order_placed: 'bg-orange-100 text-orange-800',
  install_ordered: 'bg-sky-100 text-sky-700',
  installed: 'bg-green-100 text-green-700',
};

export function funnelChip(f: Funnel): { label: string; badge: string; tone: 'stall' | 'lost' | 'done' | 'unknown' } {
  if (f.lost) return { label: f.lost.reason ? 'Lost · ' + f.lost.reason : 'Lost', badge: 'bg-red-100 text-red-700', tone: 'lost' };

  if (f.unknownFrom) return { label: f.unknownFrom.short + ' unknown', badge: 'bg-gray-100 text-gray-500', tone: 'unknown' };
  if (!f.stalledAt) return { label: 'Installed', badge: FUNNEL_BADGE.installed, tone: 'done' };
  return { label: 'Waiting on: ' + f.stalledAt.short, badge: FUNNEL_BADGE[f.furthest], tone: 'stall' };
}

'use client';

import { closureReadiness, enrichmentGaps, followUpBucket, inboundArrivalDay, inboundWorkDay, isOpenStatus, istDay, lastCallDay, sentToOutreach, withInbound } from '../../models/inbound';
import { FollowUpBucket } from '../../types/inbound';
import { InboundLead } from '../../models/mock-data';
import type { LeadDeals } from '@/lib/b2b/inbound-deals/types';
import { dealCtx } from '@/lib/b2b/inbound-deals/utils';
import { LENS, LENS_GROUPS, NO_FILTERS, OUTCOME_LENSES, PRIORITY_RANK, SIDE_LENSES } from './constants';
import type { LensPill, LensTileGroup } from '../../ui/lens-tiles';
import { InboundFilters, LeadCtx, Lens } from './types';

export const gapsFor = (l: InboundLead) => enrichmentGaps(l);

export const byNewestLeadFirst = (a: InboundLead, b: InboundLead): number => {
  const at = inboundArrivalDay(a) + (a.leadCreatedAt || '');
  const bt = inboundArrivalDay(b) + (b.leadCreatedAt || '');
  return bt.localeCompare(at);
};

export const activeFilterCount = (f: InboundFilters): number =>
  (Object.keys(NO_FILTERS) as (keyof InboundFilters)[]).filter((k) => f[k] !== NO_FILTERS[k]).length;

export const matchesFilters = (l: InboundLead, f: InboundFilters): boolean =>
  (f.status === 'all' || l.stage === f.status)
  && (f.priority === 'all' || l.priority === f.priority)
  && (f.clientType === 'all' || l.clientType === f.clientType)
  && (f.leadType === 'all' || l.leadType === f.leadType)
  && (f.location === 'all' || l.location === f.location);

const NO_DEALS: LeadDeals = { carts: [], pis: [] };

const NO_CART_TAB = ['Lost', 'Invalid'];

export const leadCtx = (l: InboundLead, deals: LeadDeals = NO_DEALS): LeadCtx => dealCtx(deals, {
  excluded: NO_CART_TAB.includes(l.stage),
  piByStatus: withInbound(l) && l.stage === 'PI Shared',
  piSince: istDay(l.piSharedAt),
  touched: lastCallDay(l),
});

const inCalls = (c: LeadCtx) => c.stage === null;

const callBucket = (l: InboundLead, c: LeadCtx, today: string, b: FollowUpBucket) =>
  inCalls(c) && withInbound(l) && !(l.stage === 'New' && !(l.callAttempts || []).length) && followUpBucket(l.followUpDate, today) === b;

export const firstCallDue = (l: InboundLead, today: string) =>
  l.stage === 'New' && !(l.callAttempts || []).length && (inboundWorkDay(l.leadCreatedAt) || today) <= today;

export const countsTomorrow = (l: InboundLead, today: string) =>
  l.stage === 'New' && !(l.callAttempts || []).length && inboundWorkDay(l.leadCreatedAt) > today;

export function lensMatches(lens: Lens, l: InboundLead, c: LeadCtx, today: string): boolean {
  switch (lens) {
    case 'today':      return inCalls(c) && (firstCallDue(l, today) || callBucket(l, c, today, 'today') || callBucket(l, c, today, 'overdue'));
    case 'new':        return inCalls(c) && firstCallDue(l, today);
    case 'due':        return callBucket(l, c, today, 'today');
    case 'overdue':    return callBucket(l, c, today, 'overdue');
    case 'ready':      return inCalls(c) && withInbound(l) && closureReadiness(l, today).ready;
    case 'deals':      return c.stage !== null;
    case 'cartOpen':   return c.stage === 'cart' && !c.updated;
    case 'piOpen':     return c.stage === 'pi' && !c.updated;
    case 'cartFollow': return c.stage === 'cart' && c.updated;
    case 'piFollow':   return c.stage === 'pi' && c.updated;
    case 'results':    return !isOpenStatus(l.stage) || sentToOutreach(l);
    case 'sent':       return sentToOutreach(l);
    case 'closed':     return l.stage === 'Closed';
    case 'lost':       return l.stage === 'Lost';
    case 'invalid':    return l.stage === 'Invalid';
    case 'arrived':    return inboundWorkDay(l.leadCreatedAt) === today;
    case 'upcoming':   return callBucket(l, c, today, 'upcoming');
    case 'undated':    return callBucket(l, c, today, 'none');
    case 'gaps':       return gapsFor(l).length > 0;
    case 'all':        return true;
  }
}

const BUCKET_RANK: Record<FollowUpBucket, number> = { overdue: 0, today: 1, upcoming: 2, none: 3 };

const callRank = (l: InboundLead, today: string) => {
  if (firstCallDue(l, today)) return 1;
  const b = followUpBucket(l.followUpDate, today);
  return b === 'today' ? 0 : b === 'overdue' ? 2 : b === 'upcoming' ? 3 : 4;
};

const byPriority = (a: InboundLead, b: InboundLead) =>
  (PRIORITY_RANK[a.priority || ''] ?? 3) - (PRIORITY_RANK[b.priority || ''] ?? 3);

const byFollowUp = (today: string) => (a: InboundLead, b: InboundLead) => {
  const ba = followUpBucket(a.followUpDate, today);
  const r = BUCKET_RANK[ba] - BUCKET_RANK[followUpBucket(b.followUpDate, today)];
  if (r !== 0) return r;
  const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
  return ba === 'overdue' ? d : d || byPriority(a, b);
};

const SORTS_BY_CALL: Lens[] = ['today', 'due', 'overdue', 'upcoming', 'ready'];

const outcomeAt = (l: InboundLead) =>
  !isOpenStatus(l.stage) ? l.statusChangedAt || '' : l.outreachReferral?.at || '';

export function sortForLens(lens: Lens, leads: InboundLead[], ctx: Map<string, LeadCtx>, today: string): InboundLead[] {
  if (OUTCOME_LENSES.includes(lens)) {
    const at = (l: InboundLead) => (lens === 'sent' ? l.outreachReferral?.at || '' : outcomeAt(l));
    return [...leads].sort((a, b) => at(b).localeCompare(at(a)));
  }
  const c = (l: InboundLead) => ctx.get(l.id);
  if (lens === 'cartOpen' || lens === 'piOpen' || lens === 'deals') {
    return [...leads].sort((a, b) =>
      Number(!!c(a)?.updated) - Number(!!c(b)?.updated)
      || (c(a)?.updated ? byFollowUp(today)(a, b) : (c(a)?.since || '').localeCompare(c(b)?.since || ''))
      || byPriority(a, b));
  }
  if (lens === 'cartFollow' || lens === 'piFollow') return [...leads].sort(byFollowUp(today));
  if (!SORTS_BY_CALL.includes(lens)) return leads;
  return [...leads].sort((a, b) => {
    const r = callRank(a, today) - callRank(b, today);
    if (r !== 0) return r;
    const p = byPriority(a, b);
    if (p !== 0) return p;
    const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
    return followUpBucket(a.followUpDate, today) === 'overdue' ? -d : d;
  });
}

export interface TileFigure {
  value: string;
  sub: string;
  warn?: boolean;
}

const sumOrders = (ls: InboundLead[]) => ls.reduce((a, l) => a + (Number(l.orderValue) || 0), 0);

export const dealValue = (c: LeadCtx | undefined): number =>
  !c?.stage ? 0 : (c.stage === 'pi' ? c.pis[0]?.value : c.carts[0]?.value) ?? 0;

const sumDeals = (ls: InboundLead[], ctx: Map<string, LeadCtx>) => ls.reduce((a, l) => a + dealValue(ctx.get(l.id)), 0);

const dueNow = (ls: InboundLead[], today: string) => ls.filter((l) => {
  const b = followUpBucket(l.followUpDate, today);
  return b === 'today' || b === 'overdue';
}).length;

export function lensValues(byLens: Record<Lens, InboundLead[]>, ctx: Map<string, LeadCtx>, tomorrow: number, today: string) {
  return {
    cartOpen: sumDeals(byLens.cartOpen, ctx),
    piOpen: sumDeals(byLens.piOpen, ctx),
    cartDue: dueNow(byLens.cartFollow, today),
    piDue: dueNow(byLens.piFollow, today),
    deals: sumDeals(byLens.deals, ctx),
    closed: sumOrders(byLens.closed),
    tomorrow,
    lostNoReason: byLens.lost.filter((l) => !l.lostReason).length,
    invalidNoNote: byLens.invalid.filter((l) => !l.invalidReason || !l.invalidNote).length,
  };
}

export function tileFigures(
  counts: Record<Lens, number>,
  v: ReturnType<typeof lensValues>,
  fmt: (n: number) => string,
): Partial<Record<Lens, TileFigure>> {
  const n = (k: Lens) => String(counts[k]);
  const waiting = (k: 'cartOpen' | 'piOpen') =>
    counts[k] ? { value: n(k), sub: `${v[k] ? `${fmt(v[k])} · ` : ''}no update yet`, warn: true } : { value: n(k), sub: 'none waiting' };
  const following = (k: 'cartFollow' | 'piFollow', due: number) =>
    ({ value: n(k), sub: due ? `${due} due now` : counts[k] ? 'booked ahead' : 'none yet', warn: due > 0 });
  return {
    new: { value: n('new'), sub: v.tomorrow ? `+${v.tomorrow} after 7 pm, for tomorrow` : counts.new ? 'not called yet' : 'all called' },
    due: { value: n('due'), sub: 'booked for today' },
    overdue: { value: n('overdue'), sub: 'date passed', warn: counts.overdue > 0 },
    ready: { value: n('ready'), sub: counts.ready ? 'close or keep going' : 'none yet', warn: counts.ready > 0 },
    cartOpen: waiting('cartOpen'),
    piOpen: waiting('piOpen'),
    cartFollow: following('cartFollow', v.cartDue),
    piFollow: following('piFollow', v.piDue),
    sent: { value: n('sent'), sub: 'to meet in person' },
    closed: { value: n('closed'), sub: v.closed ? fmt(v.closed) : 'no order value yet' },
    lost: v.lostNoReason
      ? { value: n('lost'), sub: `${v.lostNoReason} without a reason`, warn: true }
      : { value: n('lost'), sub: 'reason recorded' },
    invalid: v.invalidNoNote
      ? { value: n('invalid'), sub: `${v.invalidNoNote} missing reason or note`, warn: true }
      : { value: n('invalid'), sub: 'reason and note recorded' },
  };
}

type Unknown = 'pending' | 'failed' | null;

export function tileGroups(
  counts: Record<Lens, number>,
  figures: Partial<Record<Lens, TileFigure>>,
  leadsState: Unknown,
  dealsState: Unknown,
): LensTileGroup<Lens>[] {
  return LENS_GROUPS.map((g) => {
    const unknown = leadsState ?? (g.key === 'deals' ? dealsState : null);
    return {
      title: g.title,
      head: { key: g.head, label: unknown ? g.title : `${g.title} · ${counts[g.head]}`, rule: LENS[g.head].rule },
      tiles: g.lenses.map((k) => {
        const fig = unknown === 'pending' ? { value: '…', sub: 'loading' }
          : unknown === 'failed' ? { value: 'Unknown', sub: g.key === 'deals' ? 'carts did not load' : 'leads did not load' }
            : figures[k] ?? { value: String(counts[k]), sub: '' };
        return { key: k, title: LENS[k].title, rule: LENS[k].rule, accent: LENS[k].accent, ...fig, muted: !unknown && counts[k] === 0 };
      }),
    };
  });
}

export const sidePills = (counts: Record<Lens, number>, hideCounts: boolean): LensPill<Lens>[] =>
  SIDE_LENSES.map((k) => ({ key: k, title: LENS[k].title, rule: LENS[k].rule, count: hideCounts ? undefined : counts[k] }));

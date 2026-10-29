'use client';

import { callTally, closureReadiness, enrichmentGaps, followUpBucket, inboundWorkDay, isOpenStatus, istDay, lastAttempt, lastCallDay, piDay, sentToOutreach } from '../../models/inbound';
import { FollowUpBucket } from '../../types/inbound';
import { InboundLead } from '../../models/mock-data';
import { fmtLeadDateTime } from '../../ui/inbound-chips';
import { LENS, LENS_GROUPS, NO_FILTERS, OUTCOME_LENSES, PRIORITY_RANK, SIDE_LENSES } from './constants';
import type { LensPill, LensTileGroup } from '../../ui/lens-tiles';
import { InboundFilters, Lens } from './types';

export const toExportRow = (l: InboundLead): (string | number)[] => {
  const last = lastAttempt(l.callAttempts);
  const tally = callTally(l.callAttempts);
  return [
    l.leadCreatedAt ? fmtLeadDateTime(l.leadCreatedAt) : '',
    l.companyName || l.company || '',
    l.contactName || '',
    l.phone || '',
    l.owner || '',
    l.gstNumber || '',
    l.segment || '',
    l.clientType || '',
    l.leadType || '',
    l.priority || '',
    l.location || '',
    (l.selections || []).join(' / '),
    l.requirement || '',
    l.expectedOrderValue || '',
    l.stage,
    l.followUpDate || '',
    tally.total,
    last?.outcome || '',
    l.enqId || '',
    l.orderValue || '',
    l.lostReason || '',
    l.placedUnder?.spok || '',
    l.placedUnder?.bmName || '',
    l.placedUnder?.ecName || '',
    l.placedUnder?.ecBmName || '',
    l.kam || '',
    l.presalesOwner || '',
    l.officeLocation || '',
    piDay(l),
    lastCallDay(l),
    l.invalidReason || '',
    l.invalidNote || '',
    sentToOutreach(l) ? istDay(l.outreachReferral?.at) : '',
    l.primaryContactName || '',
    l.primaryContactPhone || '',
    (l.additionalContacts || []).map((c) => `${c.name} ${c.phone}`.trim()).join(' / '),
    tally.connected,
    tally.rnr,
  ];
};

export const gapsFor = (l: InboundLead) => enrichmentGaps(l);

export const byNewestLeadFirst = (a: InboundLead, b: InboundLead): number => {
  const at = a.leadCreatedAt || '';
  const bt = b.leadCreatedAt || '';
  if (at && bt) return bt.localeCompare(at);
  if (at) return -1;
  if (bt) return 1;
  return 0;
};

export const activeFilterCount = (f: InboundFilters): number =>
  (Object.keys(NO_FILTERS) as (keyof InboundFilters)[]).filter((k) => f[k] !== NO_FILTERS[k]).length;

export const matchesFilters = (l: InboundLead, f: InboundFilters): boolean =>
  (f.status === 'all' || l.stage === f.status)
  && (f.priority === 'all' || l.priority === f.priority)
  && (f.clientType === 'all' || l.clientType === f.clientType)
  && (f.leadType === 'all' || l.leadType === f.leadType)
  && (f.location === 'all' || l.location === f.location);

const called = (l: InboundLead) => isOpenStatus(l.stage) && !(l.stage === 'New' && !(l.callAttempts || []).length);

const callBucket = (l: InboundLead, today: string, b: FollowUpBucket) => called(l) && followUpBucket(l.followUpDate, today) === b;

export const firstCallDue = (l: InboundLead, today: string) =>
  l.stage === 'New' && !(l.callAttempts || []).length && (inboundWorkDay(l.leadCreatedAt) || today) <= today;

export const countsTomorrow = (l: InboundLead, today: string) =>
  l.stage === 'New' && !(l.callAttempts || []).length && inboundWorkDay(l.leadCreatedAt) > today;

export function lensMatches(lens: Lens, l: InboundLead, today: string): boolean {
  switch (lens) {
    case 'today':    return firstCallDue(l, today) || callBucket(l, today, 'today') || callBucket(l, today, 'overdue');
    case 'new':      return firstCallDue(l, today);
    case 'due':      return callBucket(l, today, 'today');
    case 'overdue':  return callBucket(l, today, 'overdue');
    case 'ready':    return isOpenStatus(l.stage) && closureReadiness(l, today).ready;
    case 'open':     return isOpenStatus(l.stage);
    case 'nurture':  return l.stage === 'Connected - Need nurturing';
    case 'followup': return l.stage === 'Follow up';
    case 'pi':       return l.stage === 'PI Shared';
    case 'results':  return !isOpenStatus(l.stage) || sentToOutreach(l);
    case 'sent':     return sentToOutreach(l);
    case 'closed':   return l.stage === 'Closed';
    case 'lost':     return l.stage === 'Lost';
    case 'invalid':  return l.stage === 'Invalid';
    case 'arrived':  return inboundWorkDay(l.leadCreatedAt) === today;
    case 'upcoming': return callBucket(l, today, 'upcoming');
    case 'undated':  return callBucket(l, today, 'none');
    case 'gaps':     return gapsFor(l).length > 0;
    case 'all':      return true;
  }
}

const callRank = (l: InboundLead, today: string) => {
  if (firstCallDue(l, today)) return 1;
  const b = followUpBucket(l.followUpDate, today);
  return b === 'today' ? 0 : b === 'overdue' ? 2 : b === 'upcoming' ? 3 : 4;
};

const SORTS_BY_FOLLOW_UP: Lens[] = ['today', 'due', 'overdue', 'upcoming', 'open', 'nurture', 'followup', 'pi', 'ready'];

const outcomeAt = (l: InboundLead) =>
  !isOpenStatus(l.stage) ? l.statusChangedAt || '' : l.outreachReferral?.at || '';

export function sortForLens(lens: Lens, leads: InboundLead[], today: string): InboundLead[] {
  if (OUTCOME_LENSES.includes(lens)) {
    const at = (l: InboundLead) => (lens === 'sent' ? l.outreachReferral?.at || '' : outcomeAt(l));
    return [...leads].sort((a, b) => at(b).localeCompare(at(a)));
  }
  if (!SORTS_BY_FOLLOW_UP.includes(lens)) return leads;
  return [...leads].sort((a, b) => {
    const r = callRank(a, today) - callRank(b, today);
    if (r !== 0) return r;
    const p = (PRIORITY_RANK[a.priority || ''] ?? 3) - (PRIORITY_RANK[b.priority || ''] ?? 3);
    if (p !== 0) return p;
    const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
    if (d !== 0) return followUpBucket(a.followUpDate, today) === 'overdue' ? -d : d;
    return (a.followUpTime || '').localeCompare(b.followUpTime || '');
  });
}

export interface TileFigure {
  value: string;
  sub: string;
  warn?: boolean;
}

const sumOrders = (ls: InboundLead[]) => ls.reduce((a, l) => a + (Number(l.orderValue) || 0), 0);

export function lensValues(byLens: Record<Lens, InboundLead[]>, tomorrow: number) {
  return {
    pi: sumOrders(byLens.pi),
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
  return {
    new: { value: n('new'), sub: v.tomorrow ? `+${v.tomorrow} after 5 pm, for tomorrow` : counts.new ? 'not called yet' : 'all called' },
    due: { value: n('due'), sub: 'booked for today' },
    overdue: { value: n('overdue'), sub: 'date passed', warn: counts.overdue > 0 },
    ready: { value: n('ready'), sub: counts.ready ? 'close or send on' : 'none yet', warn: counts.ready > 0 },
    nurture: { value: n('nurture'), sub: 'spoke, nothing live' },
    followup: { value: n('followup'), sub: 'live requirement' },
    pi: { value: n('pi'), sub: v.pi ? fmt(v.pi) : 'no ticket value yet' },
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

export function tileGroups(
  counts: Record<Lens, number>,
  figures: Partial<Record<Lens, TileFigure>>,
  unknown: 'pending' | 'failed' | null,
): LensTileGroup<Lens>[] {
  return LENS_GROUPS.map((g) => ({
    title: g.title,
    head: { key: g.head, label: unknown ? g.title : `${g.title} · ${counts[g.head]}`, rule: LENS[g.head].rule },
    tiles: g.lenses.map((k) => {
      const fig = unknown === 'pending' ? { value: '…', sub: 'loading' }
        : unknown === 'failed' ? { value: 'Unknown', sub: 'leads did not load' }
          : figures[k] ?? { value: String(counts[k]), sub: '' };
      return { key: k, title: LENS[k].title, rule: LENS[k].rule, accent: LENS[k].accent, ...fig, muted: !unknown && counts[k] === 0 };
    }),
  }));
}

export const sidePills = (counts: Record<Lens, number>, hideCounts: boolean): LensPill<Lens>[] =>
  SIDE_LENSES.map((k) => ({ key: k, title: LENS[k].title, rule: LENS[k].rule, count: hideCounts ? undefined : counts[k] }));

'use client';

import { enrichmentGaps, followUpBucket, hasPi, isFollowUpStatus, isOpenStatus, istDay, lastAttempt, lastCallDay, piDay, sentToOutreach } from '../../models/inbound';
import { FollowUpBucket } from '../../types/inbound';
import { InboundLead } from '../../models/mock-data';
import { fmtLeadDateTime } from '../../ui/inbound-chips';
import { LENS, NO_FILTERS, PRIORITY_RANK, SECTION_GROUPS, SIDE_LENSES } from './constants';
import type { LensPill, LensTileGroup } from '../../ui/lens-tiles';
import { InboundFilters, Lens, PiRange, Section } from './types';

export const toExportRow = (l: InboundLead): (string | number)[] => {
  const last = lastAttempt(l.callAttempts);
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
    l.callAttempts?.length || 0,
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
  ];
};

export const gapsFor = (l: InboundLead) => enrichmentGaps({
  companyName: l.companyName, gstNumber: l.gstNumber, segment: l.segment,
  clientType: l.clientType, leadType: l.leadType, priority: l.priority,
  selections: l.selections, expectedOrderValue: l.expectedOrderValue, officeLocation: l.officeLocation,
});

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

const followUp = (l: InboundLead, today: string, b: FollowUpBucket) =>
  isFollowUpStatus(l.stage) && followUpBucket(l.followUpDate, today) === b;

const isClient = (l: InboundLead) => isOpenStatus(l.stage) && !hasPi(l);

const clientFollowUp = (l: InboundLead, today: string, b: FollowUpBucket) => isClient(l) && followUp(l, today, b);

const shiftDay = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const piWindow = (r: PiRange, today: string): { from: string; to: string } =>
  r.days ? { from: shiftDay(today, 1 - r.days), to: today } : { from: r.from, to: r.to };

export function inPiRange(l: InboundLead, r: PiRange, today: string): boolean {
  if (!hasPi(l)) return false;
  const { from, to } = piWindow(r, today);
  if (!from && !to) return true;
  const day = r.basis === 'shared' ? piDay(l) : lastCallDay(l);
  return !!day && (!from || day >= from) && (!to || day <= to);
}

export function lensMatches(lens: Lens, l: InboundLead, today: string, pi: PiRange): boolean {
  const piOpen = () => inPiRange(l, pi, today) && isOpenStatus(l.stage);
  switch (lens) {
    case 'today':     return l.stage === 'New' || clientFollowUp(l, today, 'today') || clientFollowUp(l, today, 'overdue');
    case 'new':       return l.stage === 'New';
    case 'overdue':   return clientFollowUp(l, today, 'overdue');
    case 'due':       return clientFollowUp(l, today, 'today');
    case 'clients':   return isClient(l);
    case 'upcoming':  return clientFollowUp(l, today, 'upcoming');
    case 'undated':   return clientFollowUp(l, today, 'none');
    case 'arrived':   return istDay(l.leadCreatedAt) === today;
    case 'pis':       return inPiRange(l, pi, today);
    case 'pi':        return piOpen();
    case 'piChase':   return piOpen() && ['today', 'overdue'].includes(followUpBucket(l.followUpDate, today));
    case 'piWon':     return inPiRange(l, pi, today) && l.stage === 'Closed';
    case 'piDropped': return inPiRange(l, pi, today) && (l.stage === 'Lost' || l.stage === 'Invalid');
    case 'results':   return !isOpenStatus(l.stage) || sentToOutreach(l);
    case 'closed':    return l.stage === 'Closed';
    case 'lost':      return l.stage === 'Lost';
    case 'invalid':   return l.stage === 'Invalid';
    case 'sent':      return sentToOutreach(l);
    case 'gaps':      return gapsFor(l).length > 0;
    case 'all':       return true;
  }
}

const callRank = (l: InboundLead, today: string) => {
  if (l.stage === 'New') return 1;
  const b = followUpBucket(l.followUpDate, today);
  return b === 'today' ? 0 : b === 'overdue' ? 2 : b === 'upcoming' ? 3 : 4;
};

const SORTS_BY_FOLLOW_UP: Lens[] = ['today', 'clients', 'overdue', 'due', 'upcoming', 'pi', 'piChase'];
const SORTS_BY_PI_DATE: Lens[] = ['pis', 'piWon', 'piDropped'];
const SORTS_BY_OUTCOME: Lens[] = ['results', 'closed', 'lost', 'invalid', 'sent'];

const outcomeAt = (l: InboundLead) =>
  !isOpenStatus(l.stage) ? l.statusChangedAt || '' : l.outreachReferral?.at || '';

export function sortForLens(lens: Lens, leads: InboundLead[], today: string, pi: PiRange): InboundLead[] {
  if (SORTS_BY_PI_DATE.includes(lens)) {
    const day = (l: InboundLead) => (pi.basis === 'shared' ? piDay(l) : lastCallDay(l));
    return [...leads].sort((a, b) => day(b).localeCompare(day(a)));
  }
  if (SORTS_BY_OUTCOME.includes(lens)) {
    const at = (l: InboundLead) => (lens === 'sent' ? l.outreachReferral?.at || '' : outcomeAt(l));
    return [...leads].sort((a, b) => at(b).localeCompare(at(a)));
  }
  if (!SORTS_BY_FOLLOW_UP.includes(lens)) return leads;
  return [...leads].sort((a, b) => {
    if (lens === 'today' || lens === 'clients') {
      const r = callRank(a, today) - callRank(b, today);
      if (r !== 0) return r;
    }
    const p = (PRIORITY_RANK[a.priority || ''] ?? 3) - (PRIORITY_RANK[b.priority || ''] ?? 3);
    if (p !== 0) return p;
    if (a.stage === 'New' || b.stage === 'New') return 0;
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

export function lensValues(byLens: Record<Lens, InboundLead[]>) {
  return {
    pis: sumOrders(byLens.pis),
    pi: sumOrders(byLens.pi),
    piWon: sumOrders(byLens.piWon),
    closed: sumOrders(byLens.closed),
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
    new: { value: n('new'), sub: counts.new ? 'not called yet' : 'all called' },
    overdue: { value: n('overdue'), sub: 'date passed' },
    due: { value: n('due'), sub: 'booked for today' },
    upcoming: { value: n('upcoming'), sub: 'booked ahead' },
    undated: { value: n('undated'), sub: counts.undated ? 'never come up' : 'all dated', warn: counts.undated > 0 },
    arrived: { value: n('arrived'), sub: 'created today' },
    pi: { value: n('pi'), sub: v.pi ? fmt(v.pi) : 'no ticket value yet' },
    piChase: { value: n('piChase'), sub: 'today or overdue', warn: counts.piChase > 0 },
    piWon: { value: n('piWon'), sub: v.piWon ? fmt(v.piWon) : 'no order value yet' },
    piDropped: { value: n('piDropped'), sub: 'lost or invalid' },
    closed: { value: n('closed'), sub: v.closed ? fmt(v.closed) : 'no order value yet' },
    lost: v.lostNoReason
      ? { value: n('lost'), sub: `${v.lostNoReason} without a reason`, warn: true }
      : { value: n('lost'), sub: 'reason recorded' },
    invalid: v.invalidNoNote
      ? { value: n('invalid'), sub: `${v.invalidNoNote} missing reason or note`, warn: true }
      : { value: n('invalid'), sub: 'reason and note recorded' },
    sent: { value: n('sent'), sub: 'to meet in person' },
  };
}

export function tileGroups(
  section: Section,
  counts: Record<Lens, number>,
  figures: Partial<Record<Lens, TileFigure>>,
  unknown: 'pending' | 'failed' | null,
): LensTileGroup<Lens>[] {
  return SECTION_GROUPS[section].map((g) => ({
    title: g.title,
    head: g.head && { key: g.head, label: unknown ? g.title : `${g.title} · ${counts[g.head]}`, rule: LENS[g.head].rule },
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

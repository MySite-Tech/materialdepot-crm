'use client';

import { enrichmentGaps, followUpBucket, isFollowUpStatus, isOpenStatus, lastAttempt } from '../../models/inbound';
import { FollowUpBucket } from '../../types/inbound';
import { InboundLead } from '../../models/mock-data';
import { fmtLeadDateTime } from '../../ui/inbound-chips';
import { NO_FILTERS, PRIORITY_RANK } from './constants';
import { InboundFilters, Lens } from './types';

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
  ];
};

export const gapsFor = (l: InboundLead) => enrichmentGaps({
  companyName: l.companyName, gstNumber: l.gstNumber, segment: l.segment,
  clientType: l.clientType, leadType: l.leadType, priority: l.priority,
  selections: l.selections, expectedOrderValue: l.expectedOrderValue,
});

export const byNewestLeadFirst = (a: InboundLead, b: InboundLead): number => {
  const at = a.leadCreatedAt || '';
  const bt = b.leadCreatedAt || '';
  if (at && bt) return bt.localeCompare(at);
  if (at) return -1;
  if (bt) return 1;
  return 0;
};

export const istDay = (iso: string | undefined): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso).slice(0, 10);
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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

export function lensMatches(lens: Lens, l: InboundLead, today: string): boolean {
  switch (lens) {
    case 'today':    return l.stage === 'New' || followUp(l, today, 'today') || followUp(l, today, 'overdue');
    case 'new':      return l.stage === 'New';
    case 'overdue':  return followUp(l, today, 'overdue');
    case 'due':      return followUp(l, today, 'today');
    case 'upcoming': return followUp(l, today, 'upcoming');
    case 'undated':  return followUp(l, today, 'none');
    case 'pi':       return l.stage === 'PI Shared';
    case 'open':     return isOpenStatus(l.stage);
    case 'closed':   return l.stage === 'Closed';
    case 'lost':     return l.stage === 'Lost';
    case 'arrived':  return istDay(l.leadCreatedAt) === today;
    case 'gaps':     return gapsFor(l).length > 0;
    case 'all':      return true;
  }
}

const callRank = (l: InboundLead, today: string) =>
  l.stage === 'New' ? 1 : followUpBucket(l.followUpDate, today) === 'today' ? 0 : 2;

const SORTS_BY_FOLLOW_UP: Lens[] = ['today', 'overdue', 'due', 'upcoming', 'pi'];

export function sortForLens(lens: Lens, leads: InboundLead[], today: string): InboundLead[] {
  if (!SORTS_BY_FOLLOW_UP.includes(lens)) return leads;
  return [...leads].sort((a, b) => {
    if (lens === 'today') {
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

'use client';

import { OUTREACH_STATUS_COLORS, OUTREACH_STATUS_HINT, OutreachStatus } from '../../models/outreach';
import { HANDOVER_TAT_HOURS } from '../../models/outreach/handover';
import { LensGroup, OutreachFilters, RangeKey, WorkLens } from './types';

export const PAGE_SIZE = 25;

export const LENS_STATUS: Partial<Record<WorkLens, OutreachStatus>> = {
  yet: 'Yet to Meet', fu: 'Follow up', quote: 'Quote Share', pi: 'PI Shared', won: 'Closed', lost: 'Lost',
};

const statusLens = (s: OutreachStatus, title: string) => ({ title, rule: OUTREACH_STATUS_HINT[s], accent: OUTREACH_STATUS_COLORS[s] });

export const LENS: Record<WorkLens, { title: string; rule: string; accent: string }> = {
  action:    { title: 'Action needed', rule: 'Leads with something overdue or due today — a meeting to mark, notes to write, a follow-up, a sign-off or a handover.', accent: '#1A1A1A' },
  meetings:  { title: 'Meetings today', rule: 'A meeting is scheduled for today. Mark each one held or postponed in the lead.', accent: '#3B82F6' },
  followups: { title: 'Follow-ups due', rule: 'Open leads whose next follow-up date is today or earlier.', accent: '#DC2626' },
  inbox:     { title: 'From Inbound', rule: 'Inbound leads waiting for the assigned BM to accept or reject. The tile note counts the pool nobody has been assigned yet.', accent: '#0EA5E9' },
  handoff:   { title: 'Handover', rule: `Converted leads whose KAM handover is not sent, rejected, or unsigned after ${HANDOVER_TAT_HOURS}h.`, accent: '#16A34A' },
  all:       { title: 'All leads', rule: 'Every lead in view, newest first.', accent: '#6B7280' },
  yet:       statusLens('Yet to Meet', 'Yet to meet'),
  fu:        statusLens('Follow up', 'Follow up'),
  quote:     statusLens('Quote Share', 'Quote'),
  pi:        statusLens('PI Shared', 'PI shared'),
  won:       statusLens('Closed', 'Converted'),
  lost:      statusLens('Lost', 'Lost'),
  signoff:   { title: 'To sign off', rule: `Handovers sent to you, waiting for your accept or reject. The ${HANDOVER_TAT_HOURS}h clock runs from when the BM sent it.`, accent: '#F59E0B' },
  signed:    { title: 'Handed to you', rule: 'Every converted firm handed over to you.', accent: '#16A34A' },
};

export const REP_GROUPS: LensGroup[] = [
  { title: 'Action needed', head: 'action', lenses: ['meetings', 'followups', 'inbox', 'handoff'], weight: 5 },
  { title: 'Pipeline', head: 'all', lenses: ['yet', 'fu', 'quote', 'pi', 'won', 'lost'], weight: 6, flow: true },
];

export const KAM_GROUPS: LensGroup[] = [
  { title: 'Handovers', lenses: ['signoff', 'signed'], weight: 1 },
];

export const RANGE_LABEL: Record<RangeKey, string> = {
  any: 'Any time', today: 'Today', week: 'This week', last7: 'Last 7 days', last30: 'Last 30 days',
  month: 'This month', 'last-month': 'Last month', custom: 'Custom range',
};

export const NO_FILTERS: OutreachFilters = {
  companyType: 'all', leadType: 'all', segment: 'all', source: 'all',
  added: 'any', addedFrom: '', addedTo: '', search: '', onlyGaps: false,
};

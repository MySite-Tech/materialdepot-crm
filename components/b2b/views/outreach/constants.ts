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
  work:       { title: 'Calls & meetings', rule: 'Open leads with no open cart or PI that need a meeting, a call or a follow-up now: meetings today, overdue, due today and leads with no meeting booked.', accent: '#3B82F6' },
  meetings:   { title: 'Meetings today', rule: 'A meeting is scheduled for today. Mark each one held or postponed in the lead.', accent: '#3B82F6' },
  overdue:    { title: 'Overdue', rule: 'The follow-up date has passed, or a scheduled meeting before today was never marked held or postponed.', accent: '#DC2626' },
  due:        { title: 'Due today', rule: 'The next follow-up is today.', accent: '#F59E0B' },
  book:       { title: 'No meeting booked', rule: 'Yet to meet, with no meeting scheduled and nothing due. Call to book the first meeting.', accent: '#6366F1' },
  deals:      { title: 'Carts & PIs', rule: 'Leads that are not Lost with an open cart or PI on any of their numbers (Converted included: a new cart is a repeat order starting). A Lost lead with an open cart stays under Lost, with a marker.', accent: '#7C3AED' },
  cartOpen:   { title: 'Carts open', rule: 'An open cart and no call or held meeting logged since it was raised.', accent: '#4F46E5' },
  piOpen:     { title: 'PI open', rule: 'An open PI (or status PI shared) and no call or held meeting logged since.', accent: '#9333EA' },
  cartFollow: { title: 'Carts follow up', rule: 'An open cart the BM has called or met about since it was raised. Sorted by next follow-up, overdue first.', accent: '#6366F1' },
  piFollow:   { title: 'PI follow up', rule: 'An open PI the BM has called or met about since. Sorted by next follow-up, overdue first.', accent: '#A855F7' },
  other:      { title: 'Sign-offs & outcomes', rule: 'Everything outside calls, meetings and carts: assignments waiting for a BM, KAM handovers, and leads converted or lost in the period.', accent: '#16A34A' },
  inbox:      { title: 'Waiting for sign-off', rule: 'Leads an admin assigned to a BM, from Inbound or any other source, waiting for that BM to accept or reject. The note counts the leads nobody has been assigned yet: the Inbound pool plus the unassigned pool.', accent: '#0EA5E9' },
  handoff:    { title: 'Handover pending', rule: `Converted leads whose KAM handover is not sent, rejected, or unsigned after ${HANDOVER_TAT_HOURS}h.`, accent: '#16A34A' },
  action:     { title: 'Action needed', rule: 'Leads with something overdue or due today: a meeting to mark, notes to write, a follow-up, a sign-off or a handover.', accent: '#1A1A1A' },
  all:        { title: 'All leads', rule: 'Every lead added in the period, newest first.', accent: '#6B7280' },
  yet:        statusLens('Yet to Meet', 'Yet to meet'),
  fu:         statusLens('Follow up', 'Follow up'),
  quote:      statusLens('Quote Share', 'Quote'),
  pi:         statusLens('PI Shared', 'PI shared'),
  won:        statusLens('Closed', 'Converted'),
  lost:       statusLens('Lost', 'Lost'),
  signoff:    { title: 'To sign off', rule: `Handovers sent to you, waiting for your accept or reject. The ${HANDOVER_TAT_HOURS}h clock runs from when the BM sent it.`, accent: '#F59E0B' },
  signed:     { title: 'Handed to you', rule: 'Every converted firm handed over to you.', accent: '#16A34A' },
};

export const TILE_LABEL: Partial<Record<WorkLens, string>> = {
  meetings: 'Meetings', book: 'To book', inbox: 'Sign-offs', handoff: 'Handovers', won: 'Won',
};

export const REP_GROUPS: LensGroup[] = [
  { title: 'Calls & meetings', head: 'work', lenses: ['meetings', 'overdue', 'due', 'book'] },
  { title: 'Carts & PIs', head: 'deals', lenses: ['cartOpen', 'piOpen', 'cartFollow', 'piFollow'] },
  { title: 'Sign-offs & outcomes', head: 'other', lenses: ['inbox', 'handoff', 'won', 'lost'] },
];

export const KAM_GROUPS: LensGroup[] = [
  { title: 'Handovers', lenses: ['signoff', 'signed'] },
];

export const SIDE_LENSES: WorkLens[] = ['action', 'yet', 'fu', 'quote', 'pi', 'all'];

export const PERIOD_LENSES: WorkLens[] = ['won', 'lost', 'yet', 'fu', 'quote', 'pi', 'all'];

export const DEAL_LENSES: WorkLens[] = ['deals', 'cartOpen', 'piOpen', 'cartFollow', 'piFollow'];

export const RANGE_LABEL: Record<RangeKey, string> = {
  any: 'Any time', today: 'Today', week: 'This week', last7: 'Last 7 days', last30: 'Last 30 days',
  month: 'This month', 'last-month': 'Last month', custom: 'Custom range',
};

export const NO_FILTERS: OutreachFilters = {
  companyType: 'all', leadType: 'all', segment: 'all', source: 'all',
  search: '', onlyGaps: false,
};

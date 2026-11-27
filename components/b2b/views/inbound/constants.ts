'use client';

import { INBOUND_STATUS_COLORS } from '../../models/inbound';
import { InboundFilters, Lens, LensGroup, LensMeta } from './types';

export const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

export const LIST_PAGE_SIZE = 25;

export const NO_FILTERS: InboundFilters = {
  owner: 'all', status: 'all', priority: 'all', clientType: 'all', leadType: 'all',
  location: 'all', kylasStage: 'all', createdFrom: '', createdTo: '',
};

const CALL_RULE = 'Leads still in the call phase: open, not sent to Outreach, no open cart or PI, already called at least once';

const DEAL_RULE = 'Open leads with a cart or PI open on any of their numbers. Carts and PIs are read from the deal tickets every 5 minutes';

export const LENS: Record<Lens, LensMeta> = {
  today: {
    title: 'Calls',
    rule: "Leads in the call phase: first calls, then today's follow-ups, then overdue ones. A lead with an open cart or PI moves to Carts & PIs. A lead that arrives after 7 pm counts from the next working day.",
    empty: 'Nothing to call today.',
    accent: '#1A1A1A',
  },
  new: {
    title: 'First call',
    rule: 'Status New and never called, arrived by 7 pm today or earlier. Aim to have none left by end of day.',
    empty: 'Every lead due today has had its first call.',
    accent: INBOUND_STATUS_COLORS.New,
  },
  due: {
    title: 'Due today',
    rule: `${CALL_RULE}, with the next follow-up booked for today. An RNR books the next working day automatically.`,
    empty: 'No follow-up is booked for today.',
    accent: '#F59E0B',
  },
  overdue: {
    title: 'Overdue',
    rule: `${CALL_RULE}, with a follow-up date before today.`,
    empty: 'No follow-up is overdue.',
    accent: '#DC2626',
  },
  ready: {
    title: 'Ready to close',
    rule: '5 RNRs in the last 7 days, or 7+ days old with 5+ calls and still not at Follow up. Decide: close as Lost, or send them on.',
    empty: 'Nothing is ready to close.',
    accent: '#B45309',
  },
  deals: {
    title: 'Carts & PIs',
    rule: `${DEAL_RULE}. A PI also counts when the lead's status is PI Shared. These come before ordinary calls.`,
    empty: 'No open lead has a cart or PI open.',
    accent: '#4F46E5',
  },
  cartOpen: {
    title: 'Carts open',
    rule: `${DEAL_RULE}. A cart (In Cart) with no call logged since it was opened, so nobody has taken an update yet.`,
    empty: 'Every open cart has had an update call.',
    accent: '#6366F1',
  },
  piOpen: {
    title: 'PI open',
    rule: `${DEAL_RULE}. A PI (Quote Approval Pending, Availability Check, Hold Stock, or status PI Shared) with no call logged since it was raised.`,
    empty: 'Every open PI has had an update call.',
    accent: INBOUND_STATUS_COLORS['PI Shared'],
  },
  cartFollow: {
    title: 'Carts follow up',
    rule: `${DEAL_RULE}. An open cart already called since it was opened, by next follow-up date, overdue first.`,
    empty: 'No cart is being followed up.',
    accent: '#818CF8',
  },
  piFollow: {
    title: 'PI follow up',
    rule: `${DEAL_RULE}. An open PI already called since it was raised, by next follow-up date, overdue first.`,
    empty: 'No PI is being followed up.',
    accent: '#A855F7',
  },
  results: {
    title: 'Outcomes',
    rule: 'Every lead that reached an outcome: sent to Outreach, Closed, Lost or Invalid.',
    empty: 'No outcome recorded yet.',
    accent: '#1A1A1A',
  },
  sent: {
    title: 'Sent to Outreach',
    rule: 'Qualified and handed to Outreach to meet in person. Only these reach Outreach’s Inbound pool.',
    empty: 'No lead has been sent to Outreach.',
    accent: '#0F766E',
  },
  closed: {
    title: 'Closed',
    rule: 'Status Closed. Value is the deal ticket.',
    empty: 'Nothing closed yet.',
    accent: INBOUND_STATUS_COLORS.Closed,
  },
  lost: {
    title: 'Lost',
    rule: 'A genuine enquiry that did not convert. The last column is the reason.',
    empty: 'Nothing lost.',
    accent: INBOUND_STATUS_COLORS.Lost,
  },
  invalid: {
    title: 'Invalid',
    rule: 'Junk or disqualified. Each one needs a logged call, a reason and a note.',
    empty: 'Nothing marked invalid.',
    accent: INBOUND_STATUS_COLORS.Invalid,
  },
  arrived: {
    title: 'Arrived today',
    rule: 'Counted for today: arrived after 7 pm on the last working day, or by 7 pm today.',
    empty: 'No lead counted for today.',
    accent: INBOUND_STATUS_COLORS.New,
  },
  upcoming: {
    title: 'Upcoming',
    rule: `${CALL_RULE}, with the follow-up booked after today.`,
    empty: 'No follow-up is booked ahead.',
    accent: '#0EA5E9',
  },
  undated: {
    title: 'No follow-up date',
    rule: `${CALL_RULE}, but with no date, so they never come up as due.`,
    empty: 'Every called lead has a date.',
    accent: '#9CA3AF',
  },
  all: {
    title: 'All leads',
    rule: 'Every lead since 10 Nov, newest first.',
    empty: 'No leads match these filters.',
    accent: '#6B7280',
  },
  gaps: {
    title: 'Needs enrichment',
    rule: 'Missing one or more of: company name, primary person, segment, client type, lead type, priority, city, selection. An End Consumer is not asked for the first three. GST and expected value are optional.',
    empty: 'Every lead is fully filled in.',
    accent: '#F59E0B',
  },
};

export const LENS_GROUPS: { key: LensGroup; title: string; head: Lens; lenses: Lens[] }[] = [
  { key: 'calls', title: 'Calls', head: 'today', lenses: ['new', 'due', 'overdue', 'ready'] },
  { key: 'deals', title: 'Carts & PIs', head: 'deals', lenses: ['cartOpen', 'piOpen', 'cartFollow', 'piFollow'] },
  { key: 'results', title: 'Outcomes', head: 'results', lenses: ['sent', 'closed', 'lost', 'invalid'] },
];

export const lensGroupOf = (lens: Lens): LensGroup =>
  LENS_GROUPS.find((g) => g.head === lens || g.lenses.includes(lens))?.key ?? 'side';

export const SIDE_LENSES: Lens[] = ['arrived', 'upcoming', 'undated', 'gaps', 'all'];

export const LENS_KEYS = Object.keys(LENS) as Lens[];

export const OUTCOME_LENSES: Lens[] = ['results', 'sent', 'closed', 'lost', 'invalid'];

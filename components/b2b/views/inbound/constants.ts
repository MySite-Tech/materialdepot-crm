'use client';

import { INBOUND_STATUS_COLORS } from '../../models/inbound';
import { InboundFilters, Lens, LensMeta } from './types';

export const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

export const LIST_PAGE_SIZE = 25;

export const NO_FILTERS: InboundFilters = {
  owner: 'all', status: 'all', priority: 'all', clientType: 'all', leadType: 'all',
  location: 'all', kylasStage: 'all', createdFrom: '', createdTo: '',
};

const CALL_RULE = 'Open leads already called at least once';

export const LENS: Record<Lens, LensMeta> = {
  today: {
    title: 'Call today',
    rule: "First calls, then today's follow-ups, then overdue ones. A lead that arrives after 5 pm counts from the next working day.",
    empty: 'Nothing to call today.',
    accent: '#1A1A1A',
  },
  new: {
    title: 'First call',
    rule: 'Status New and never called, arrived by 5 pm today or earlier. Aim to have none left by end of day.',
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
    rule: '5 RNRs in the last 7 days, or 7+ days old with 4+ calls and still not at Follow up. Close them as Lost, or send them on.',
    empty: 'Nothing is ready to close.',
    accent: '#B45309',
  },
  open: {
    title: 'Pipeline',
    rule: 'Every open lead: New, Connected, Follow up or PI Shared.',
    empty: 'No open lead.',
    accent: '#6B7280',
  },
  nurture: {
    title: 'Connected',
    rule: 'Spoke to them, nothing live yet. Moves to Follow up once there is a requirement.',
    empty: 'No connected lead waiting.',
    accent: INBOUND_STATUS_COLORS['Connected - Need nurturing'],
  },
  followup: {
    title: 'Follow up',
    rule: 'A live requirement being worked towards a PI.',
    empty: 'No lead on Follow up.',
    accent: INBOUND_STATUS_COLORS['Follow up'],
  },
  pi: {
    title: 'PI shared',
    rule: 'A PI is out. The value is the deal ticket picked as its Enq ID.',
    empty: 'No PI is out.',
    accent: INBOUND_STATUS_COLORS['PI Shared'],
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
    rule: 'Counted for today: arrived after 5 pm on the last working day, or by 5 pm today.',
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
    rule: 'Every loaded lead, newest first.',
    empty: 'No leads match these filters.',
    accent: '#6B7280',
  },
  gaps: {
    title: 'Needs enrichment',
    rule: 'Missing one or more of: company name, primary person, GST, segment, client type, lead type, priority, city, selection, expected value.',
    empty: 'Every lead is fully filled in.',
    accent: '#F59E0B',
  },
};

export const LENS_GROUPS: { title: string; head: Lens; lenses: Lens[] }[] = [
  { title: 'Call today', head: 'today', lenses: ['new', 'due', 'overdue', 'ready'] },
  { title: 'Pipeline', head: 'open', lenses: ['nurture', 'followup', 'pi'] },
  { title: 'Outcomes', head: 'results', lenses: ['sent', 'closed', 'lost', 'invalid'] },
];

export const SIDE_LENSES: Lens[] = ['arrived', 'upcoming', 'undated', 'gaps', 'all'];

export const LENS_KEYS = Object.keys(LENS) as Lens[];

export const OUTCOME_LENSES: Lens[] = ['results', 'sent', 'closed', 'lost', 'invalid'];

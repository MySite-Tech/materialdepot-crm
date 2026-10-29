'use client';

import { INBOUND_STATUS_COLORS } from '../../models/inbound';
import { InboundFilters, Lens, LensMeta, PiRange, Section } from './types';

export const EXPORT_HEADERS = [
  'Lead date', 'Company', 'Contact name', 'Contact number', 'Assigned BM',
  'GST', 'Segment', 'Client type', 'Lead type', 'Priority', 'Location',
  'Selection', 'Requirement', 'Expected value', 'Status', 'Next follow-up',
  'Attempts', 'Last outcome', 'Enq ID', 'Order value', 'Lost reason',
  'Spok', 'BM (placed under)', 'Assisted at EC', 'EC BM', 'KAM', 'Qualified by',
  'Office location', 'PI shared', 'Last call', 'Invalid reason', 'Invalid note', 'Sent to Outreach',
];

export const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

export const LIST_PAGE_SIZE = 25;

export const NO_FILTERS: InboundFilters = {
  owner: 'all', status: 'all', priority: 'all', clientType: 'all', leadType: 'all',
  location: 'all', kylasStage: 'all', createdFrom: '', createdTo: '',
};

const FOLLOW_UP_RULE = 'No PI yet, on Connected - Need nurturing or Follow up';

export const LENS: Record<Lens, LensMeta> = {
  today: {
    title: 'Call today',
    rule: "Clients only. Today's follow-ups, then leads waiting for a first call, then overdue follow-ups.",
    empty: 'Nothing to call today.',
    accent: '#1A1A1A',
  },
  new: {
    title: 'First call',
    rule: 'Status New: straight from Kylas, not yet worked. Aim to have none left by end of day.',
    empty: 'Every new lead has had its first call.',
    accent: INBOUND_STATUS_COLORS.New,
  },
  overdue: {
    title: 'Overdue',
    rule: `${FOLLOW_UP_RULE}, with a follow-up date before today.`,
    empty: 'No client follow-up is overdue.',
    accent: '#DC2626',
  },
  due: {
    title: 'Due today',
    rule: `${FOLLOW_UP_RULE}, with a follow-up booked for today.`,
    empty: 'No client follow-up is booked for today.',
    accent: '#F59E0B',
  },
  clients: {
    title: 'All clients',
    rule: 'Every open lead that has no PI yet. Once a PI is shared the lead moves to the PI tab.',
    empty: 'No open client without a PI.',
    accent: '#6B7280',
  },
  upcoming: {
    title: 'Upcoming',
    rule: `${FOLLOW_UP_RULE}, with a follow-up booked after today.`,
    empty: 'No client follow-up is booked ahead.',
    accent: '#0EA5E9',
  },
  undated: {
    title: 'No follow-up date',
    rule: `${FOLLOW_UP_RULE}, but with no date, so they never come up as due.`,
    empty: 'Every client follow-up has a date.',
    accent: '#9CA3AF',
  },
  arrived: {
    title: 'Arrived today',
    rule: 'Created in Kylas today, whatever their status now.',
    empty: 'No lead arrived today.',
    accent: INBOUND_STATUS_COLORS.New,
  },
  pis: {
    title: 'PIs',
    rule: 'Every lead that has had a PI, inside the date range above, whatever happened to it since.',
    empty: 'No PI in this date range.',
    accent: INBOUND_STATUS_COLORS['PI Shared'],
  },
  pi: {
    title: 'Open',
    rule: 'Has a PI and is not Closed, Lost or Invalid. Value is the deal ticket matched by Enq ID.',
    empty: 'No open PI in this date range.',
    accent: INBOUND_STATUS_COLORS['PI Shared'],
  },
  piChase: {
    title: 'Follow-up due',
    rule: 'An open PI whose follow-up date is today or already passed.',
    empty: 'Every open PI is followed up.',
    accent: '#DC2626',
  },
  piWon: {
    title: 'Converted',
    rule: 'Had a PI and is now Closed. Value is the deal ticket.',
    empty: 'No PI converted in this date range.',
    accent: INBOUND_STATUS_COLORS.Closed,
  },
  piDropped: {
    title: 'Dropped',
    rule: 'Had a PI and is now Lost or Invalid.',
    empty: 'No PI dropped in this date range.',
    accent: INBOUND_STATUS_COLORS.Lost,
  },
  results: {
    title: 'Results',
    rule: 'Every lead that reached an outcome: Closed, Lost, Invalid, or sent to Outreach.',
    empty: 'No outcome recorded yet.',
    accent: '#1A1A1A',
  },
  closed: {
    title: 'Closed',
    rule: 'Status Closed. Value is the deal ticket.',
    empty: 'Nothing closed yet.',
    accent: INBOUND_STATUS_COLORS.Closed,
  },
  lost: {
    title: 'Lost',
    rule: 'A genuine enquiry that did not convert. The last column is the reason the rep recorded.',
    empty: 'Nothing lost.',
    accent: INBOUND_STATUS_COLORS.Lost,
  },
  invalid: {
    title: 'Invalid',
    rule: 'Not a genuine enquiry. Each one needs a logged call, a reason and a note, shown in the last column.',
    empty: 'Nothing marked invalid.',
    accent: INBOUND_STATUS_COLORS.Invalid,
  },
  sent: {
    title: 'Sent to Outreach',
    rule: 'Qualified and handed to the Outreach team to meet in person. Only these appear in Outreach’s From Inbound pool.',
    empty: 'No lead has been sent to Outreach.',
    accent: '#0F766E',
  },
  all: {
    title: 'All leads',
    rule: 'Every loaded lead, newest first.',
    empty: 'No leads match these filters.',
    accent: '#6B7280',
  },
  gaps: {
    title: 'Needs enrichment',
    rule: 'Missing one or more of: company name, GST, segment, client type, lead type, priority, selection, expected value, office location.',
    empty: 'Every lead is fully filled in.',
    accent: '#F59E0B',
  },
};

export const SECTIONS: { key: Section; title: string; lens: Lens }[] = [
  { key: 'clients', title: 'Clients', lens: 'today' },
  { key: 'pi', title: 'PI', lens: 'pis' },
  { key: 'results', title: 'Results', lens: 'results' },
];

export const SECTION_COUNT: Record<Section, Lens> = { clients: 'clients', pi: 'pis', results: 'results' };

export const SECTION_GROUPS: Record<Section, { title: string; head?: Lens; lenses: Lens[] }[]> = {
  clients: [
    { title: 'Call today', head: 'today', lenses: ['new', 'overdue', 'due'] },
    { title: 'All clients', head: 'clients', lenses: ['upcoming', 'undated', 'arrived'] },
  ],
  pi: [{ title: 'PIs', head: 'pis', lenses: ['pi', 'piChase', 'piWon', 'piDropped'] }],
  results: [{ title: 'Results', head: 'results', lenses: ['closed', 'lost', 'invalid', 'sent'] }],
};

export const LENS_SECTION: Partial<Record<Lens, Section>> = Object.fromEntries(
  (Object.keys(SECTION_GROUPS) as Section[]).flatMap((s) =>
    SECTION_GROUPS[s].flatMap((g) => [...(g.head ? [g.head] : []), ...g.lenses].map((k) => [k, s]))),
);

export const SIDE_LENSES: Lens[] = ['gaps', 'all'];

export const LENS_KEYS = Object.keys(LENS) as Lens[];

export const PI_PRESETS = [7, 30, 90] as const;

export const DEFAULT_PI_RANGE: PiRange = { basis: 'shared', days: 30, from: '', to: '' };

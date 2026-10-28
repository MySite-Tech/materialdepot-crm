'use client';

import { INBOUND_STATUS_COLORS } from '../../models/inbound';
import { InboundFilters, Lens, LensMeta } from './types';

export const EXPORT_HEADERS = [
  'Lead date', 'Company', 'Contact name', 'Contact number', 'Assigned BM',
  'GST', 'Segment', 'Client type', 'Lead type', 'Priority', 'Location',
  'Selection', 'Requirement', 'Expected value', 'Status', 'Next follow-up',
  'Attempts', 'Last outcome', 'Enq ID', 'Order value', 'Lost reason',
  'Spok', 'BM (placed under)', 'Assisted at EC', 'EC BM', 'KAM', 'Qualified by',
];

export const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

export const LIST_PAGE_SIZE = 25;

export const NO_FILTERS: InboundFilters = {
  owner: 'all', status: 'all', priority: 'all', clientType: 'all', leadType: 'all',
  location: 'all', kylasStage: 'all', createdFrom: '', createdTo: '',
};

export const LENS: Record<Lens, LensMeta> = {
  today: {
    title: 'Call today',
    rule: "Today's follow-ups, then leads waiting for a first call, then overdue follow-ups.",
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
    rule: 'Connected, Follow up or PI Shared, with a follow-up date before today.',
    empty: 'No follow-up is overdue.',
    accent: '#DC2626',
  },
  due: {
    title: 'Due today',
    rule: 'Connected, Follow up or PI Shared, with a follow-up booked for today.',
    empty: 'No follow-up is booked for today.',
    accent: '#F59E0B',
  },
  upcoming: {
    title: 'Upcoming',
    rule: 'Connected, Follow up or PI Shared, with a follow-up booked after today.',
    empty: 'No follow-up is booked ahead.',
    accent: '#0EA5E9',
  },
  pi: {
    title: 'PI Shared',
    rule: 'Status PI Shared. Value is the deal ticket matched by Enq ID.',
    empty: 'No PI is out.',
    accent: INBOUND_STATUS_COLORS['PI Shared'],
  },
  open: {
    title: 'Pipeline',
    rule: 'Every lead not yet Closed or Lost. Value is the deal ticket, plus the BM’s estimate only where there is no ticket value yet.',
    empty: 'No open lead.',
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
    rule: 'Status Lost. The last column is the reason the rep recorded.',
    empty: 'Nothing lost.',
    accent: INBOUND_STATUS_COLORS.Lost,
  },
  all: {
    title: 'All leads',
    rule: 'Every loaded lead, newest first.',
    empty: 'No leads match these filters.',
    accent: '#6B7280',
  },
  arrived: {
    title: 'Arrived today',
    rule: 'Created in Kylas today, whatever their status now.',
    empty: 'No lead arrived today.',
    accent: INBOUND_STATUS_COLORS.New,
  },
  undated: {
    title: 'No follow-up date',
    rule: 'On a follow-up status but with no date, so they never come up as due. Mostly carried over from the old board.',
    empty: 'Every follow-up has a date.',
    accent: '#9CA3AF',
  },
  gaps: {
    title: 'Needs enrichment',
    rule: 'Missing one or more of the §3.2 / §3.3 fields: company name, GST, segment, client type, lead type, priority, selection, expected value.',
    empty: 'Every lead is fully filled in.',
    accent: '#F59E0B',
  },
};

export const LENS_GROUPS: { title: string; head?: Lens; lenses: Lens[] }[] = [
  { title: 'Call today', head: 'today', lenses: ['new', 'overdue', 'due'] },
  { title: 'Pipeline', lenses: ['upcoming', 'pi', 'open'] },
  { title: 'Outcome', lenses: ['closed', 'lost'] },
];

export const SIDE_LENSES: Lens[] = ['all', 'arrived', 'undated', 'gaps'];

export const LENS_KEYS = Object.keys(LENS) as Lens[];

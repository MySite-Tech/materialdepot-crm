import { ClientStatus, CLIENT_ENTITY_TYPES, CLIENT_STATUS_ORDER, CLIENT_SOURCES, SEGMENTS, STUDIO_ACCESS } from '../../models/client';
import { ClientColumn, ClientFilters, ClientLens, ClientLensMeta, SortKey, SortState, FilterKey, FilterOption } from './types';

export const PAGE_SIZE = 25;

export const CLIENT_COLUMNS: { key: ClientColumn; label: string }[] = [
  { key: 'contact', label: 'Primary contact' },
  { key: 'gst', label: 'GST' },
  { key: 'orders', label: 'Orders' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'avgOrder', label: 'Avg order' },
  { key: 'openCarts', label: 'Open carts' },
  { key: 'lastOrder', label: 'Last order' },
  { key: 'status', label: 'Status' },
  { key: 'studio', label: 'Studio Space' },
  { key: 'kam', label: 'KAM SPoC' },
  { key: 'inboundSpoc', label: 'Inbound SPoC' },
  { key: 'outreachSpoc', label: 'Outreach SPoC' },
  { key: 'ecSpoc', label: 'EC SPoC' },
  { key: 'clientType', label: 'Client type' },
  { key: 'segment', label: 'Segment' },
  { key: 'source', label: 'Source' },
];

export const COLUMNS_HIDDEN_AT_FIRST: ClientColumn[] = ['enquiries', 'avgOrder', 'openCarts', 'clientType', 'segment', 'source'];

export const COLUMNS_STORAGE_KEY = 'b2b_client_hidden_columns';

export const CLIENT_LENS: Record<ClientLens, ClientLensMeta> = {
  all:      { title: 'All firms', heading: 'All firms', rule: 'Every firm in the Client Database that matches the search and filters.', empty: 'No firm matches.', accent: '#1F2937' },
  active:   { title: 'Active', heading: 'Active firms', rule: 'Last order placed this calendar month or last (M-0 or M-1). Bands are by calendar month, so a firm moves only on the 1st.', empty: 'No firm has ordered this month or last month.', accent: '#22C55E' },
  m2to3:    { title: 'Inactive 2–3 months', heading: 'Inactive 2–3 months', rule: 'Last order two or three calendar months back (M-2 or M-3). The easiest to win back, closest to going quiet first.', empty: 'No firm last ordered two or three months back.', accent: '#F59E0B' },
  m4to6:    { title: 'Inactive 4–6 months', heading: 'Inactive 4–6 months', rule: 'Last order four to six calendar months back (M-4 to M-6). Most recently lapsed first.', empty: 'No firm last ordered four to six months back.', accent: '#9CA3AF' },
  m7to12:   { title: 'Inactive 7–12 months', heading: 'Inactive 7–12 months', rule: 'Last order seven to twelve calendar months back (M-7 to M-12). Most recently lapsed first.', empty: 'No firm last ordered seven to twelve months back.', accent: '#6B7280' },
  m12plus:  { title: 'Over 12 months', heading: 'Inactive over 12 months', rule: 'Last order more than twelve calendar months back (M-13 or older). Firms that have never ordered are counted under Never ordered, not here.', empty: 'No firm last ordered more than twelve months back.', accent: '#374151' },
  never:    { title: 'Never ordered', heading: 'Never ordered', rule: 'No order on record for any of the firm’s numbers. A–Z.', empty: 'Every firm has ordered at least once.', accent: '#D1D5DB' },
  unknown:  { title: 'Status unknown', heading: 'Status unknown', rule: 'Order dates could not be read, or Django served a last order date after today, which cannot be a real order. These firms are neither Active nor Inactive until the date is fixed.', empty: 'Every firm has a usable last order date.', accent: '#3B82F6' },
  nokam:    { title: 'No KAM', heading: 'Firms with no KAM', rule: 'No key account manager is assigned. Highest revenue first.', empty: 'Every firm has a KAM.', accent: '#DC2626' },
  pending:  { title: 'Awaiting KAM', heading: 'Waiting for KAM sign-off', rule: 'Firms an admin assigned to a KAM who has not yet accepted or rejected them.', empty: 'No assignment is waiting on a KAM.', accent: '#7C3AED' },
};

export const STATUS_LENSES: ClientLens[] = ['all', 'active', 'm2to3', 'm4to6', 'm7to12', 'm12plus', 'never'];

export const LENS_STATUS: Partial<Record<ClientLens, ClientStatus>> = {
  active: 'Active',
  m2to3: 'Inactive 2–3 months',
  m4to6: 'Inactive 4–6 months',
  m7to12: 'Inactive 7–12 months',
  m12plus: 'Inactive over 12 months',
  never: 'Never ordered',
  unknown: 'Unknown',
};

export const LENS_DEFAULT_SORT: Record<ClientLens, SortState> = {
  all:      { key: 'lastOrder', dir: 'desc' },
  active:   { key: 'lastOrder', dir: 'desc' },
  m2to3:    { key: 'lastOrder', dir: 'asc' },
  m4to6:    { key: 'lastOrder', dir: 'desc' },
  m7to12:   { key: 'lastOrder', dir: 'desc' },
  m12plus:  { key: 'lastOrder', dir: 'desc' },
  never:    { key: 'company', dir: 'asc' },
  unknown:  { key: 'company', dir: 'asc' },
  nokam:    { key: 'revenue', dir: 'desc' },
  pending:  { key: 'company', dir: 'asc' },
};

export const SORT_FIRST_DIR: Record<SortKey, SortState['dir']> = {
  company: 'asc', orders: 'desc', revenue: 'desc', lastOrder: 'desc',
};

export const NO_FILTERS: ClientFilters = {};

export const TEXT_FILTERS: Partial<Record<FilterKey, string>> = {
  firm: 'Firm name',
  contact: 'Name or number',
  ecSpoc: 'Name',
};

const COUNT: FilterOption[] = [['0', 'None'], ['1', '1+'], ['2', '2+'], ['5', '5+'], ['10', '10+'], ['25', '25+']];
const AMOUNT: FilterOption[] = [['10000', '₹10K+'], ['100000', '₹1L+'], ['500000', '₹5L+'], ['2500000', '₹25L+'], ['10000000', '₹1Cr+']];

export const FIXED_FILTER_OPTIONS: Partial<Record<FilterKey, FilterOption[]>> = {
  gst: [['yes', 'Has GST'], ['no', 'No GST']],
  orders: COUNT,
  enquiries: COUNT,
  revenue: AMOUNT,
  avgOrder: AMOUNT,
  openCarts: [['0', 'None'], ...AMOUNT],
  lastOrder: [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 180 days'], ['over180', 'Over 180 days ago'], ['never', 'Never']],
  status: CLIENT_STATUS_ORDER.map((s) => [s, s]),
  studio: [['power', STUDIO_ACCESS.power.label], ['non-power', STUDIO_ACCESS['non-power'].label], ['none', 'Not onboarded']],
  clientType: [...CLIENT_ENTITY_TYPES.map((t): FilterOption => [t, t]), ['none', 'Not set']],
  segment: [...SEGMENTS.map((s): FilterOption => [s, `Segment ${s}`]), ['none', 'Not set']],
  source: CLIENT_SOURCES.map((s) => [s, s]),
};

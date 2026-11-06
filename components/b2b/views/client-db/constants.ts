import { ACTIVE_DAYS, INACTIVE_DAYS, ClientStatus } from '../../models/client';
import { ClientColumn, ClientFilters, ClientLens, ClientLensMeta, SortKey, SortState } from './types';

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
  active:   { title: 'Active', heading: 'Active firms', rule: `Last order placed within the last ${ACTIVE_DAYS} days, counted back from today.`, empty: `No firm has ordered in the last ${ACTIVE_DAYS} days.`, accent: '#22C55E' },
  m1to3:    { title: 'Inactive 1–3 months', heading: 'Inactive 1–3 months', rule: `No order in the last ${ACTIVE_DAYS} days, but one ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago. The easiest to win back, closest to going quiet first.`, empty: 'No firm is 1–3 months past its last order.', accent: '#F59E0B' },
  m3to6:    { title: 'Inactive 3–6 months', heading: 'Inactive 3–6 months', rule: `Last order ${INACTIVE_DAYS + 1}–180 days ago. Most recently lapsed first.`, empty: 'No firm is 3–6 months past its last order.', accent: '#9CA3AF' },
  m6to12:   { title: 'Inactive 6–12 months', heading: 'Inactive 6–12 months', rule: 'Last order 181–365 days ago. Most recently lapsed first.', empty: 'No firm is 6–12 months past its last order.', accent: '#6B7280' },
  m12plus:  { title: 'Over 12 months', heading: 'Inactive over 12 months', rule: 'Last order more than a year ago. Firms that have never ordered are counted under Never ordered, not here.', empty: 'No firm is more than a year past its last order.', accent: '#374151' },
  never:    { title: 'Never ordered', heading: 'Never ordered', rule: 'No order on record for any of the firm’s numbers. A–Z.', empty: 'Every firm has ordered at least once.', accent: '#D1D5DB' },
  unknown:  { title: 'Status unknown', heading: 'Status unknown', rule: 'Order dates could not be read, or Django served a last order date after today, which cannot be a real order. These firms are neither Active nor Inactive until the date is fixed.', empty: 'Every firm has a usable last order date.', accent: '#3B82F6' },
  nokam:    { title: 'No KAM', heading: 'Firms with no KAM', rule: 'No key account manager is assigned. Highest revenue first.', empty: 'Every firm has a KAM.', accent: '#DC2626' },
  pending:  { title: 'Awaiting KAM', heading: 'Waiting for KAM sign-off', rule: 'Firms an admin assigned to a KAM who has not yet accepted or rejected them.', empty: 'No assignment is waiting on a KAM.', accent: '#7C3AED' },
};

export const STATUS_LENSES: ClientLens[] = ['all', 'active', 'm1to3', 'm3to6', 'm6to12', 'm12plus', 'never'];

export const LENS_STATUS: Partial<Record<ClientLens, ClientStatus>> = {
  active: 'Active',
  m1to3: 'Inactive 1–3 months',
  m3to6: 'Inactive 3–6 months',
  m6to12: 'Inactive 6–12 months',
  m12plus: 'Inactive 12+ months',
  never: 'Never ordered',
  unknown: 'Unknown',
};

export const LENS_DEFAULT_SORT: Record<ClientLens, SortState> = {
  all:      { key: 'lastOrder', dir: 'desc' },
  active:   { key: 'lastOrder', dir: 'desc' },
  m1to3:    { key: 'lastOrder', dir: 'asc' },
  m3to6:    { key: 'lastOrder', dir: 'desc' },
  m6to12:   { key: 'lastOrder', dir: 'desc' },
  m12plus:  { key: 'lastOrder', dir: 'desc' },
  never:    { key: 'company', dir: 'asc' },
  unknown:  { key: 'company', dir: 'asc' },
  nokam:    { key: 'revenue', dir: 'desc' },
  pending:  { key: 'company', dir: 'asc' },
};

export const SORT_FIRST_DIR: Record<SortKey, SortState['dir']> = {
  company: 'asc', orders: 'desc', revenue: 'desc', lastOrder: 'desc',
};

export const NO_FILTERS: ClientFilters = { segment: 'all', type: 'all', kam: 'all' };

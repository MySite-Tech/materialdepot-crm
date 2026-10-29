import { ACTIVE_DAYS, INACTIVE_DAYS } from '../../models/client';
import { ClientFilters, ClientLens, ClientLensMeta, SortKey, SortState } from './types';

export const PAGE_SIZE = 25;

export const CLIENT_LENS: Record<ClientLens, ClientLensMeta> = {
  all:      { title: 'All firms', heading: 'All firms', rule: 'Every firm in the Client Database that matches the search and filters.', empty: 'No firm matches.', accent: '#1F2937' },
  active:   { title: 'Active', heading: 'Active firms', rule: `Last order placed within the last ${ACTIVE_DAYS} days, counted back from today.`, empty: `No firm has ordered in the last ${ACTIVE_DAYS} days.`, accent: '#22C55E' },
  lapsing:  { title: 'Inactive 1 month', heading: 'Inactive 1 month', rule: `No order in the last ${ACTIVE_DAYS} days, but one ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago. Closest to going fully inactive first.`, empty: 'No firm is in its first month without an order.', accent: '#F59E0B' },
  inactive: { title: 'Inactive', heading: 'Inactive firms', rule: `Last order more than ${INACTIVE_DAYS} days ago, including firms that have never ordered. Most recently lapsed first.`, empty: 'No inactive firm.', accent: '#9CA3AF' },
  unknown:  { title: 'Unread', heading: 'Orders not read', rule: 'Order dates could not be read for these firms, so they are neither Active nor Inactive.', empty: 'Every firm’s orders were read.', accent: '#3B82F6' },
  nokam:    { title: 'No KAM', heading: 'Firms with no KAM', rule: 'No key account manager is assigned, including firms a KAM rejected (the KAM column says why). Highest revenue first.', empty: 'Every firm has a KAM.', accent: '#DC2626' },
  pending:  { title: 'Awaiting KAM', heading: 'Waiting for KAM sign-off', rule: 'Firms an admin assigned to a KAM who has not yet accepted or rejected them.', empty: 'No assignment is waiting on a KAM.', accent: '#7C3AED' },
};

export const STATUS_LENSES: ClientLens[] = ['all', 'active', 'lapsing', 'inactive'];

export const LENS_DEFAULT_SORT: Record<ClientLens, SortState> = {
  all:      { key: 'lastOrder', dir: 'desc' },
  active:   { key: 'lastOrder', dir: 'desc' },
  lapsing:  { key: 'lastOrder', dir: 'asc' },
  inactive: { key: 'lastOrder', dir: 'desc' },
  unknown:  { key: 'company', dir: 'asc' },
  nokam:    { key: 'revenue', dir: 'desc' },
  pending:  { key: 'company', dir: 'asc' },
};

export const SORT_FIRST_DIR: Record<SortKey, SortState['dir']> = {
  company: 'asc', orders: 'desc', revenue: 'desc', lastOrder: 'desc',
};

export const NO_FILTERS: ClientFilters = { segment: 'all', type: 'all', kam: 'all' };

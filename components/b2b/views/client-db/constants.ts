import { ACTIVE_WINDOW_MONTHS } from '../../models/client';
import { AT_RISK_WINDOW_DAYS } from '../../constants/kam';
import { ClientFilters, ClientLens, ClientLensMeta, SortKey, SortState } from './types';

export const PAGE_SIZE = 25;

export const CLIENT_LENS: Record<ClientLens, ClientLensMeta> = {
  all:      { title: 'All firms', heading: 'All firms', rule: 'Every firm in the Client Database that matches the search and filters.', empty: 'No firm matches.', accent: '#1F2937' },
  active:   { title: 'Active', heading: 'Active firms', rule: `At least one order placed in the last ${ACTIVE_WINDOW_MONTHS} months, counted back from today.`, empty: `No firm has ordered in the last ${ACTIVE_WINDOW_MONTHS} months.`, accent: '#22C55E' },
  lapsing:  { title: 'Lapsing soon', heading: 'Lapsing soon', rule: `Active, but turns Inactive within ${AT_RISK_WINDOW_DAYS} days unless they order again. Closest to lapsing first.`, empty: `No active firm lapses in the next ${AT_RISK_WINDOW_DAYS} days.`, accent: '#F59E0B' },
  inactive: { title: 'Inactive', heading: 'Inactive firms', rule: `No order in the last ${ACTIVE_WINDOW_MONTHS} months, including firms that have never ordered. Most recently lapsed first.`, empty: 'No inactive firm.', accent: '#9CA3AF' },
  unknown:  { title: 'Unread', heading: 'Orders not read', rule: 'Order dates could not be read for these firms, so they are neither Active nor Inactive.', empty: 'Every firm’s orders were read.', accent: '#3B82F6' },
  nokam:    { title: 'No KAM', heading: 'Firms with no KAM', rule: 'No key account manager is assigned. Highest revenue first.', empty: 'Every firm has a KAM.', accent: '#DC2626' },
};

export const STATUS_LENSES: ClientLens[] = ['all', 'active', 'lapsing', 'inactive'];

export const LENS_DEFAULT_SORT: Record<ClientLens, SortState> = {
  all:      { key: 'lastOrder', dir: 'desc' },
  active:   { key: 'lastOrder', dir: 'desc' },
  lapsing:  { key: 'lastOrder', dir: 'asc' },
  inactive: { key: 'lastOrder', dir: 'desc' },
  unknown:  { key: 'company', dir: 'asc' },
  nokam:    { key: 'revenue', dir: 'desc' },
};

export const SORT_FIRST_DIR: Record<SortKey, SortState['dir']> = {
  company: 'asc', orders: 'desc', revenue: 'desc', lastOrder: 'desc',
};

export const NO_FILTERS: ClientFilters = { segment: 'all', type: 'all', kam: 'all' };

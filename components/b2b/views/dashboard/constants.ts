'use client';

import { HealthStatus } from '../../models/account-health';
import { ClientStatus } from '../../models/client';
import { RangeKey } from './types';
import { StatsBasis } from '@/lib/b2b';

export const CLIENT_STATUS_ORDER: ClientStatus[] = ['Active', 'Inactive', 'Unknown'];

export const SOURCE_COLORS = ['#1A1A1A', '#EAB308', '#0F766E', '#C2410C'];

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This Month',
  lastMonth: 'Last Month',
  all: 'All Time',
};

export const BASIS_LABELS: Record<StatsBasis, string> = {
  created: 'Cart created',
  order: 'Order placed',
};

export const BASIS_HINT: Record<StatsBasis, string> = {
  created: 'carts raised in the period, whenever they order',
  order: 'orders booked in the period, whenever the cart was raised',
};

export const UNATTRIBUTED_SOURCE = 'No B2B rep on cart';

export const OPEN_STATUSES = ['In Cart', 'Quote Approval Pending', 'Availability Check', 'Hold Stock'];

export const OPEN_PAGE_SIZE = 25;

export const OPEN_ROWS_CAP = 500;

export const HEALTH_ACTION: Record<HealthStatus, string> = {
  green: '—',
  amber: 'Notify KAM to intervene',
  red: 'Escalate to manager',
};

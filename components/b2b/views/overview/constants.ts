'use client';

import { ClientStatus } from '../../models/client';
import { RangeKey } from './types';
import { StatsBasis } from '@/lib/b2b';

export const CLIENT_STATUS_ORDER: ClientStatus[] = ['Active', 'Inactive 1 month', 'Inactive', 'Never ordered', 'Unknown'];

export const SOURCE_COLORS = ['#2563EB', '#D97706', '#0D9488', '#9333EA'];

export const UNATTRIBUTED_COLOR = '#9CA3AF';

export const TEAM_COLORS = { inbound: '#2563EB', outreach: '#D97706', kam: '#0D9488' } as const;

export const MUTED_STAGES = new Set(['Lost', 'Invalid']);

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This month',
  lastMonth: 'Last month',
  all: 'All time',
};

export const BASIS_LABELS: Record<StatsBasis, string> = {
  order: 'By order date',
  created: 'By cart date',
};

export const BASIS_HINT: Record<StatsBasis, string> = {
  created: 'Counts carts raised in the period, whenever they ordered.',
  order: 'Counts orders booked in the period, whenever the cart was raised.',
};

export const UNATTRIBUTED_SOURCE = 'No B2B rep on cart';

export const OPEN_STATUSES = ['In Cart', 'Quote Approval Pending', 'Availability Check', 'Hold Stock'];

export const OPEN_PAGE_SIZE = 25;

export const OPEN_ROWS_CAP = 500;

export const ATTENTION_ROWS = 6;

export const COHORT_MONTHS = 6;

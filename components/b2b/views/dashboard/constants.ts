'use client';

import { HealthStatus } from '../../models/account-health';
import { ClientStatus } from '../../models/client';
import { RangeKey } from './types';

export const CLIENT_STATUS_ORDER: ClientStatus[] = ['Active', 'Inactive', 'Unknown'];

export const SOURCE_COLORS = ['#1A1A1A', '#EAB308', '#0F766E', '#C2410C'];

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This Month',
  lastMonth: 'Last Month',
  all: 'All Time',
};

export const HEALTH_ACTION: Record<HealthStatus, string> = {
  green: '—',
  amber: 'Notify KAM to intervene',
  red: 'Escalate to manager',
};

'use client';

import { HealthStatus } from '../models/accountHealth';
import { ClientStatus } from '../models/clientModel';
import { RangeKey } from '../types/b2b-dashboard';

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

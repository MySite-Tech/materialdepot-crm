'use client';

import { LeadSource, UnifiedStatus } from '@/lib/b2b';

export const SOURCE_COLORS: Record<LeadSource, string> = {
  Inbound:  '#3B82F6',
  Outreach: '#EAB308',
};

export const STATUS_COLORS: Record<UnifiedStatus, string> = {
  'Closed':       '#22C55E',
  'Yet to Close': '#64748B',
};

export const PAGE_SIZE = 50;

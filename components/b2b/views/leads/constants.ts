'use client';

import { EC_B2B_REFERRAL } from '../../models/outreach';
import { LeadSource, UnifiedStatus } from '@/lib/b2b';

export type LeadSourceLabel = LeadSource | typeof EC_B2B_REFERRAL;

export const SOURCE_COLORS: Record<LeadSourceLabel, string> = {
  Inbound:  '#3B82F6',
  Outreach: '#EAB308',
  [EC_B2B_REFERRAL]: '#0F766E',
};

export const STATUS_COLORS: Record<UnifiedStatus, string> = {
  'Closed':       '#22C55E',
  'Yet to Close': '#64748B',
};

export const PAGE_SIZE = 50;

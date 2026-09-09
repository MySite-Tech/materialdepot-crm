'use client';

import { LeadSource, UnifiedStatus } from '@/lib/b2bLeads';

export const SOURCE_COLORS: Record<LeadSource, string> = {
  Inbound:  '#3B82F6',
  Outreach: '#EAB308',
};

export const STATUS_COLORS: Record<UnifiedStatus, string> = {
  'Closed':       '#22C55E',
  'Yet to Close': '#64748B',
};

export const EXPORT_HEADERS = [
  'Company Name', 'GST', 'Contact Number', 'Enquiry ID', 'Order Value',
  'Expected Date of Closure', 'KAM', 'Source', 'Spok', 'Status', 'Lost',
  'Source status',
];

export const PAGE_SIZE = 50;

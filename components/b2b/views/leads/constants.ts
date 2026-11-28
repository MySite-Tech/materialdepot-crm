'use client';

import { EC_B2B_REFERRAL } from '../../models/outreach';
import { LeadSource } from '@/lib/b2b';

export type LeadSourceLabel = LeadSource | typeof EC_B2B_REFERRAL;

export const SOURCE_COLORS: Record<LeadSourceLabel, string> = {
  Inbound:  '#3B82F6',
  Outreach: '#EAB308',
  [EC_B2B_REFERRAL]: '#0F766E',
};

export const PAGE_SIZE = 25;

export const ALL = 'all';

export type LeadSection = 'pipeline' | 'ec';

export type LeadState = 'open' | 'closed' | 'lost';

export type Period = typeof ALL | 'this-month' | 'last-month' | '30d' | '90d' | 'custom';

export const PERIODS: { key: Period; label: string }[] = [
  { key: ALL, label: 'All time' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'custom', label: 'Custom range' },
];

export const STATES: { key: LeadState | typeof ALL; label: string; dot?: string }[] = [
  { key: ALL, label: 'All' },
  { key: 'open', label: 'Open', dot: '#64748B' },
  { key: 'closed', label: 'Closed', dot: '#16A34A' },
  { key: 'lost', label: 'Lost', dot: '#DC2626' },
];

export interface LeadFilters {
  q: string;
  state: LeadState | typeof ALL;
  period: Period;
  from: string;
  to: string;
  source: string;
  owner: string;
  kam: string;
  ec: string;
  referrer: string;
  unassigned: boolean;
}

export const NO_FILTERS: LeadFilters = {
  q: '', state: ALL, period: ALL, from: '', to: '', source: ALL, owner: ALL, kam: ALL, ec: ALL, referrer: ALL, unassigned: false,
};

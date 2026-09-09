'use client';

import { Bucket } from './types';

export const Q3_OPTIONS = [
  'Pricing / Budget Expectations',
  'Collection / Product Preference',
  'Service & Delivery Timelines',
  'Sales Experience',
];

export const C = {
  promoter: '#22C55E',
  passive: '#EAB308',
  detractor: '#EF4444',
  line: '#2A78D6',
  bm: '#8B5CF6',
  grid: '#F0F0F0',
  axis: '#9CA3AF',
};

export const PILL = 'flex items-center gap-2 h-9 px-3.5 rounded-full bg-white border border-gray-300 text-gray-800 text-[13px] font-semibold hover:border-gray-400 cursor-pointer whitespace-nowrap';

export const BUCKET_STYLE: Record<Bucket, string> = {
  Promoter: 'bg-green-50 text-green-700',
  Passive: 'bg-amber-50 text-amber-700',
  Detractor: 'bg-red-50 text-red-700',
};

export const BUCKET_TEXT: Record<Bucket, string> = {
  Promoter: 'text-green-600',
  Passive: 'text-amber-600',
  Detractor: 'text-red-600',
};

export const DATE_PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thismonth', label: 'This month' },
];

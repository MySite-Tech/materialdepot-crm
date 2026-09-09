'use client';

import { FollowUpBucket } from '../models/inboundModel';

export const EXPORT_HEADERS = [
  'Lead date', 'Company', 'Contact name', 'Contact number', 'Assigned BM',
  'GST', 'Segment', 'Client type', 'Lead type', 'Priority', 'Location',
  'Selection', 'Requirement', 'Expected value', 'Status', 'Next follow-up',
  'Attempts', 'Last outcome', 'Enq ID', 'Order value', 'Lost reason',
  'Spok', 'KAM', 'Qualified by',
];

export const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

export const BUCKET_ORDER: FollowUpBucket[] = ['overdue', 'today', 'upcoming', 'none'];

export const BUCKET_TITLE: Record<FollowUpBucket, string> = {
  overdue:  'Overdue',
  today:    'Due today',
  upcoming: 'Upcoming',
  none:     'No follow-up date set',
};

export const BUCKET_NOTE: Record<FollowUpBucket, string> = {
  overdue:  'Past their follow-up date — call these first.',
  today:    "Today's committed calls.",
  upcoming: 'Scheduled ahead.',
  none:     'On a status that needs a date but has none — mostly leads carried over from the old board.',
};

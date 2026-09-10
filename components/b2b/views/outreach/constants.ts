'use client';

import { FollowUpBucket } from '../../models/outreach';

export const EXPORT_HEADERS = [
  'Company', 'Contact person', 'Designation', 'Contact number', 'GST',
  'Segment', 'Lead type', 'Company type', 'BM',
  'Meetings', 'Held', 'Next meeting', 'Location',
  'Selection', 'Requirement', 'Expected value',
  'Status', 'Next follow-up', 'Enq ID', 'Order value', 'Expected closure',
  'Lost reason', 'Spok', 'KAM', 'EC', 'EC BM',
];

export const BUCKET_ORDER: FollowUpBucket[] = ['overdue', 'today', 'upcoming', 'none'];

export const BUCKET_TITLE: Record<FollowUpBucket, string> = {
  overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', none: 'No follow-up date set',
};

export const BUCKET_NOTE: Record<FollowUpBucket, string> = {
  overdue:  'Past their follow-up date — chase these first.',
  today:    "Today's committed follow-ups.",
  upcoming: 'Scheduled ahead.',
  none:     'On a status that carries a date but has none.',
};

export const PAGE_SIZE = 50;

import type { B2BTeam } from '@/lib/b2b/team/types';
import type { ReminderGroups } from '../../models/reminders';
import { REMINDER_LEAD_MINUTES, REMINDER_UPCOMING_DAYS } from '../../models/reminders';

export const REMINDER_PAGE_SIZE = 25;

export const TEAM_ACCENT: Record<B2BTeam, string> = {
  inbound: '#0F766E',
  outreach: '#2563EB',
  kam: '#7C3AED',
};

export const EVERYONE = '__everyone__';
export const MINE = '__mine__';
export const ALL = 'all';

export type Bucket = keyof ReminderGroups;

export const BUCKETS: { key: Bucket; label: string; rule: string; tone: string; empty: string }[] = [
  { key: 'now', label: 'Due now', tone: 'text-amber-700', rule: `Timed follow-ups, from ${REMINDER_LEAD_MINUTES} minutes before until the end of the day`, empty: 'Nothing due in the next hour' },
  { key: 'today', label: 'Today', tone: 'text-gray-900', rule: 'Due today with no time set', empty: 'Nothing else booked for today' },
  { key: 'overdue', label: 'Missed', tone: 'text-red-600', rule: 'The date has passed and nothing was logged since. Most recent first', empty: 'Nothing missed' },
  { key: 'later', label: 'Coming up', tone: 'text-gray-900', rule: `Later today and the next ${REMINDER_UPCOMING_DAYS} days`, empty: `Nothing booked for the next ${REMINDER_UPCOMING_DAYS} days` },
];

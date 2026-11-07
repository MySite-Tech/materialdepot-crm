import type { ReminderKind, ReminderState } from './types';

export const REMINDER_LEAD_MINUTES = 60;

export const REMINDER_UPCOMING_DAYS = 7;

export const REMINDER_REFRESH_MS = 15 * 60_000;

export const REMINDER_TICK_MS = 30_000;

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  inbound: 'Inbound call-back',
  outreach: 'Outreach follow-up',
  meeting: 'Outreach meeting',
  firm: 'KAM follow-up',
  pi: 'PI follow-up',
};

export const REMINDER_ACTIVE_STATES: ReminderState[] = ['soon', 'due', 'today'];

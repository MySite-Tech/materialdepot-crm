import type { B2BTeam } from '@/lib/b2b/team/types';
import type { ReminderKind, ReminderState, ReminderTopic } from './types';

export const REMINDER_LEAD_MINUTES = 60;

export const REMINDER_UPCOMING_DAYS = 7;

export const REMINDER_REFRESH_MS = 15 * 60_000;

export const REMINDER_TICK_MS = 30_000;

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  inbound: 'Call-back',
  outreach: 'Follow-up',
  meeting: 'Meeting',
  firm: 'Follow-up',
  pi: 'PI follow-up',
};

export const REMINDER_TEAM_LABEL: Record<B2BTeam, string> = {
  inbound: 'Inbound',
  outreach: 'Outreach',
  kam: 'KAM',
};

export const REMINDER_TOPIC_LABEL: Record<ReminderTopic, string> = {
  touch: 'Calls & meetings',
  cart: 'Carts & PIs',
};

export const CART_STAGES = ['Quote Share', 'PI Shared'];

export const REMINDER_ACTIVE_STATES: ReminderState[] = ['soon', 'due', 'today'];

import type { B2BTeam } from '@/lib/b2b/team/types';

export const REMINDER_PAGE_SIZE = 25;

export const TEAM_ACCENT: Record<B2BTeam, string> = {
  inbound: '#0F766E',
  outreach: '#2563EB',
  kam: '#7C3AED',
};

export const EVERYONE = '__everyone__';
export const MINE = '__mine__';

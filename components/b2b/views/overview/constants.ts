'use client';

export const TEAM_COLORS = { inbound: '#2563EB', outreach: '#D97706', kam: '#0D9488' } as const;

export const MUTED_STAGES = new Set(['Lost', 'Invalid']);

export const ATTENTION_ROWS = 6;

export const COHORT_MONTHS = 6;

export const SUB_TABS = { summary: 'Overview', analysis: 'Revenue analysis', clients: 'Clients' } as const;

export type OverviewSub = keyof typeof SUB_TABS;

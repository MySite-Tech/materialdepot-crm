'use client';

import { ClientStatus } from '../../models/client';

export const CLIENT_STATUS_ORDER: ClientStatus[] = ['Active', 'Inactive 1–3 months', 'Inactive 3–6 months', 'Inactive 6–12 months', 'Inactive 12+ months', 'Never ordered', 'Unknown'];

export const TEAM_COLORS = { inbound: '#2563EB', outreach: '#D97706', kam: '#0D9488' } as const;

export const MUTED_STAGES = new Set(['Lost', 'Invalid']);

export const ATTENTION_ROWS = 6;

export const COHORT_MONTHS = 6;

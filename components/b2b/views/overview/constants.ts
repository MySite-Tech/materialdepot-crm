'use client';

import { ClientStatus } from '../../models/client';

export const CLIENT_STATUS_ORDER: ClientStatus[] = ['Active', 'Inactive 1 month', 'Inactive', 'Never ordered', 'Unknown'];

export const TEAM_COLORS = { inbound: '#2563EB', outreach: '#D97706', kam: '#0D9488' } as const;

export const MUTED_STAGES = new Set(['Lost', 'Invalid']);

export const ATTENTION_ROWS = 6;

export const COHORT_MONTHS = 6;

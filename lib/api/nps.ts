import { mdFetch } from './client';

// ---------------------------------------------------------------------------
// NPS / Feedback
// ---------------------------------------------------------------------------

export interface NPSRow {
  id: number;
  name: string;
  contact: number | null;
  store: string;
  bm: string;
  visit_date: string;
  time: string;
  status: 'submitted' | 'pending';
  feedback_id: number | null;
  score: number | null;
  understood: boolean | null;
  better: string[];
  remark: string;
}

export interface NPSCard { nps: number | null; responses: number }
export interface NPSOverview {
  today: NPSCard;
  yesterday: NPSCard;
  day_before: NPSCard;
  month: NPSCard;
  daily: { date: string; nps: number }[];
}

export interface NPSFilters { branches?: string[]; from?: string; to?: string; search?: string }

function npsParams(filters: NPSFilters): string {
  const params = new URLSearchParams();
  if (filters.branches?.length) params.set('branch', filters.branches.join(','));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchNPSTracker(filters: NPSFilters = {}): Promise<NPSRow[]> {
  return (await mdFetch(`/nps/tracker/${npsParams(filters)}`)) || [];
}

export async function fetchNPSOverview(filters: NPSFilters = {}): Promise<NPSOverview> {
  return await mdFetch(`/nps/overview/${npsParams(filters)}`);
}

export async function submitNPS(payload: {
  footfall_id: number;
  score: number | null;
  understood: boolean | null;
  better: string[];
  remark: string;
}): Promise<{ feedback_id: number }> {
  return await mdFetch('/nps/submit/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

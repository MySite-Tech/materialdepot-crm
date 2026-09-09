import { FIELD_WORKER_SKIP, siteAuditTargetForCrmPermission } from './roleSync';

export const JOB_STATUS: Record<string, { l: string; c: string }> = {
  pending: { l: 'Pending', c: 'c-pending' },
  created: { l: 'Service Created', c: 'c-scheduled' },
  follow_up: { l: 'Follow-up set', c: 'c-scheduled' },
  call_na: { l: 'Call N/A', c: 'c-pending' },
  assigned: { l: 'Assigned', c: 'c-scheduled' },
  callpending: { l: 'Call Pending', c: 'c-scheduled' },
  scheduled: { l: 'Scheduled', c: 'c-scheduled' },
  onway: { l: 'On the Way', c: 'c-onway' },
  atsite: { l: 'At Site', c: 'c-atsite' },
  completed: { l: 'Completed', c: 'c-completed' },
  reschedule: { l: 'Reschedule', c: 'c-reschedule' },
};

export const SQFT_PER_ROLL = 57;

export const NPS_PROMOTER_MIN = 9;
export const NPS_DETRACTOR_MAX = 7;
export type NpsBand = 'promoter' | 'neutral' | 'detractor';
export const NPS_BAND_LABELS: Record<NpsBand, string> = {
  promoter: 'Promoters (Q1 9–10)',
  neutral: 'Neutral (Q1 = 8)',
  detractor: 'Detractors (Q1 ≤ 7)',
};
export const NPS_HOUSE_NOTE = 'Field-service NPS, Material Depot bands: promoter 9–10, neutral 8, detractor ≤7 — stricter than textbook NPS.';

export function npsBand(q1: number): NpsBand {
  if (q1 >= NPS_PROMOTER_MIN) return 'promoter';
  if (q1 <= NPS_DETRACTOR_MAX) return 'detractor';
  return 'neutral';
}

export type NpsSummary = { nps: number | null; prom: number; neu: number; det: number; total: number };

export function npsFrom(scores: Array<number | string | null | undefined>): NpsSummary {
  let prom = 0, neu = 0, det = 0;
  for (const s of scores) {
    const q1 = Number(s);
    if (!Number.isFinite(q1) || q1 <= 0) continue;
    const b = npsBand(q1);
    if (b === 'promoter') prom++;
    else if (b === 'neutral') neu++;
    else det++;
  }
  const total = prom + neu + det;
  return { nps: total ? Math.round(((prom - det) / total) * 100) : null, prom, neu, det, total };
}

export function avgScore(scores: Array<number | string | null | undefined>): number | null {
  const vs = scores.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
  return vs.length ? +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1) : null;
}

export function initials(n?: string | null) {
  return (n || '').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
}
export function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateA(ds?: string | null) {
  if (!ds) return '—';
  const d = new Date(ds + 'T00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtLog(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const ts = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + ts;
}

export function siteAuditRoleForCrmRole(crmRole?: string | null): string | null {
  const target = siteAuditTargetForCrmPermission(String(crmRole || ''));
  if (target === FIELD_WORKER_SKIP || target === null || target === 'admin') return null;
  return target;
}

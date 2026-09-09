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

/* ── NPS bands: ONE definition for every Site Audit surface ────────────────
   Field-service NPS is computed from Q1 ("overall experience", 1–10) on the
   `ratings` table. Material Depot deliberately runs a STRICTER band than
   textbook NPS — a 7 is a detractor here, and only an 8 is neutral — which is
   why every card that shows this number also prints the band next to it
   (`NPS_BAND_LABELS`) rather than leaving the reader to assume the textbook
   one. `material-depot-site`'s Admin.html analytics uses the same three
   thresholds; keep them in step.

   Do NOT reuse these for the `crm.nps` tab (components/nps). That dashboard
   measures a different question asked of store-visit footfall through the
   Django tracker, on textbook bands (detractor ≤6) — a separate measure that
   happens to share the word "NPS". Two numbers, two definitions, both
   labelled; never averaged together. */
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

/* `null` NPS means "no scores", which every card renders as "—" rather than
   as a zero — a zero NPS is a real, bad result and must not be produced by an
   empty set. Non-numeric/blank scores are dropped, not counted as detractors. */
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

/* Mean of a 1–10 question, to one decimal — shared so the Q1/Q2/Q3 average
   tiles on the COE dashboard and in Analytics can never round differently. */
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

/* ── CRM role → the Site Audit dashboard that role should land on ───────────
   The sub-permission slugs above (`site_audit.*`) are set by hand per person
   in Admin > Users, and almost nobody has one — which is why BMs and store
   managers saw nothing in the Site Audit tab even once it was granted. Their
   CRM permission already says what they are, so derive the dashboard from it
   and use the hand-set sub-permission only as an override.

   Returns null when the CRM role implies no dashboard of its own: `admin`
   (which gets the company-wide oversight rail instead, not a personal
   dashboard), anything mapped to null ("no Site Audit access"), and
   `field_worker`/unknown permissions, which can't be resolved to auditor vs
   installer without a human — see siteAuditTargetForCrmPermission. */
export function siteAuditRoleForCrmRole(crmRole?: string | null): string | null {
  const target = siteAuditTargetForCrmPermission(String(crmRole || ''));
  if (target === FIELD_WORKER_SKIP || target === null || target === 'admin') return null;
  return target;
}

/* Shared read-only helpers for the CRM's Site Audit tab and its Insights
   views. Talks directly to material-depot-site's own Supabase project
   (separate from the CRM's) — same anon-key REST pattern used across that
   app. GET only; nothing here writes. */

export const SB_URL = 'https://jqrdfnjfxqxrazfkaofm.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcmRmbmpmeHF4cmF6Zmthb2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTU5NTcsImV4cCI6MjA5NjY3MTk1N30.2mvCPc0E_vDn2WaID5sEjwU4Dyj53rhevGrSPBa3__g';
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

export async function sbGet(q: string): Promise<any> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + q, { headers: H, signal: ctrl.signal });
    return r.json();
  } finally {
    clearTimeout(tid);
  }
}

/* Long-timeout GET for heavier analytics queries (matches sbGetLong, 45s). */
export async function sbGetLong(q: string): Promise<any> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 45000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + q, { headers: H, signal: ac.signal });
    return r.json();
  } finally {
    clearTimeout(tid);
  }
}

export const ROLES: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: '#5b3aa6' },
  service_mgr: { label: 'Service Manager', color: '#1F3A5F' },
  site_auditor: { label: 'Site Auditor', color: '#2E6CA8' },
  installer: { label: 'Site Installer', color: '#1f7a3f' },
  auditor_installer: { label: 'Auditor + Installer', color: '#0f6e74' },
  store_staff: { label: 'Store Team', color: '#9a6200' },
};

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

export function initials(n?: string | null) {
  return (n || '').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
}
export function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateA(ds?: string | null) {
  if (!ds) return '—';
  const d = new Date(ds + 'T00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtLog(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const ts = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + ts;
}

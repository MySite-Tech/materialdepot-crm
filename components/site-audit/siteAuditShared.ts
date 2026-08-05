/* Shared read-only helpers for the CRM's Site Audit tab and its Insights
   views. Talks directly to material-depot-site's own Supabase project
   (separate from the CRM's) — same anon-key REST pattern used across that
   app. GET only; nothing here writes. */

export const SB_URL = 'https://jqrdfnjfxqxrazfkaofm.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcmRmbmpmeHF4cmF6Zmthb2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTU5NTcsImV4cCI6MjA5NjY3MTk1N30.2mvCPc0E_vDn2WaID5sEjwU4Dyj53rhevGrSPBa3__g';
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

/* Short-lived cache so switching between Site Audit sub-tabs in quick
   succession doesn't re-hit the network for a query another tab (or the same
   tab's own poll) already ran moments ago. Each view's own 30s poll interval
   still gets fresh data on every tick since 8s < 30s. Keyed by the exact
   query string, so it never mixes results across different filters/tables. */
const CACHE_TTL_MS = 8000;
const cache = new Map<string, { ts: number; promise: Promise<any> }>();

// Entries only get evicted when the SAME query string is requested again or
// a write happens to touch its table — a long-lived tab that cycles through
// many distinct filter/date-range/pagination combinations (which each get
// their own cache key) would otherwise accumulate stale entries forever.
// Sweep anything past its TTL on a slower cadence than the TTL itself.
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.ts >= CACHE_TTL_MS) cache.delete(key);
    }
  }, CACHE_TTL_MS * 2);
}

async function cachedFetch(url: string, signal: AbortSignal): Promise<any> {
  try {
    const r = await fetch(url, { headers: H, signal });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`[siteAudit] ${r.status} ${r.statusText} for ${url}${body ? ' — ' + body.slice(0, 300) : ''}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    // Network failure or our own abort timeout — resolve null like a failed
    // HTTP response above, so sbGet/sbGetLong never reject and every caller
    // can rely on the same "null/[] means no data" contract.
    console.error(`[siteAudit] fetch failed for ${url}`, e);
    return null;
  }
}

// Writes must evict any cached reads of the table they touch — otherwise a
// refetch within CACHE_TTL_MS of a write can return pre-write data. Tables
// with a `_slim` mirror (e.g. install_orders / install_orders_slim) reflect
// the same underlying rows, so a write to either side must evict cached
// reads of both — otherwise e.g. SiteAuditInstallOpsView's install_orders_slim
// list can show stale data for up to CACHE_TTL_MS after an install_orders edit.
function invalidateTable(t: string): void {
  const base = t.endsWith('_slim') ? t.slice(0, -'_slim'.length) : t;
  const variants = [base, base + '_slim'];
  for (const key of cache.keys()) {
    if (variants.some((v) => key === v || key.startsWith(v + '?'))) cache.delete(key);
  }
}

function withCache(q: string, timeoutMs: number): Promise<any> {
  const now = Date.now();
  const hit = cache.get(q);
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.promise;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  const promise = cachedFetch(SB_URL + '/rest/v1/' + q, ctrl.signal).finally(() => clearTimeout(tid));
  cache.set(q, { ts: now, promise });
  // Don't let a failed request (rejection, or a resolved null from a non-2xx)
  // poison the cache for the full TTL — evict it so the next caller retries.
  promise.then((result) => { if (result == null) cache.delete(q); }, () => cache.delete(q));
  return promise;
}

export async function sbGet(q: string): Promise<any> {
  return withCache(q, 12000);
}

/* Long-timeout GET for heavier analytics queries (matches sbGetLong, 45s). */
export async function sbGetLong(q: string): Promise<any> {
  return withCache(q, 45000);
}

/* ── Writes (Store Team / Site Auditor / Site Installer apps) ──────────────
   These mutate the same Site Audit Supabase project the read views above
   query. Verbatim ports of sbPost/sbPatch/sbDel/uploadPhoto from
   material-depot-site's app/src/lib/supabase.js. */

export async function sbPost(t: string, b: any): Promise<any> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(b), signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    const j = await r.json();
    invalidateTable(t);
    return j;
  } finally {
    clearTimeout(tid);
  }
}

export async function sbPatch(t: string, id: string, b: any): Promise<void> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(b), signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    invalidateTable(t);
  } finally {
    clearTimeout(tid);
  }
}

/* Long-timeout PATCH (90s) for heavy payloads — job-card writes with photos
   embedded as base64/URLs can be large and slow on mobile connections. */
export async function sbPatchLong(t: string, id: string, b: any): Promise<void> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 90000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(b), signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    invalidateTable(t);
  } finally {
    clearTimeout(tid);
  }
}

export async function sbDel(t: string, id: string): Promise<void> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: H, signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    invalidateTable(t);
  } finally {
    clearTimeout(tid);
  }
}

/* Uploads a data: URL (JPEG) to the `job-photos` storage bucket and returns
   its public URL. Used by room photos, arrival photos, doc scans, signatures.
   Every call site falls back to embedding the raw base64 dataURL straight in
   the row on failure — on flaky field/mobile connections that fallback was
   firing on the very first dropped request, leaving multi-MB base64 blobs
   permanently stuck in install_orders/audit_orders rows (this is what blew
   the Jobs Overview query up to 26MB, see SiteAuditJobsView.tsx). Retrying a
   couple of times with a short backoff before giving up turns most of those
   transient drops into successful uploads instead. */
async function uploadPhotoAttempt(blob: Blob, fname: string): Promise<string> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(SB_URL + '/storage/v1/object/job-photos/' + fname, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: blob,
      signal: ac.signal,
    });
    if (!r.ok) throw new Error('upload failed: ' + r.status);
    return SB_URL + '/storage/v1/object/public/job-photos/' + fname;
  } finally {
    clearTimeout(tid);
  }
}

export async function uploadPhoto(dataURL: string): Promise<string> {
  const blob = await (await fetch(dataURL)).blob();
  const fname = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const attempts = 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await uploadPhotoAttempt(blob, fname);
    } catch (e) {
      if (i === attempts) {
        console.error(`[siteAudit] photo upload failed after ${attempts} attempts, falling back to inline base64`, e);
        throw e;
      }
      await new Promise((res) => setTimeout(res, 1000 * i));
    }
  }
  throw new Error('upload failed');
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

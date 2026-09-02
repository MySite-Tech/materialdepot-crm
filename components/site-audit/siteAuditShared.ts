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

/* ── app_settings ─────────────────────────────────────────────────────────
   Tiny key→jsonb settings table. `knownId` lets a re-save skip the lookup.
   Used by the foam/payout config and by the shared slot windows below. */
export async function loadSetting(key: string): Promise<{ id: string | null; value: any }> {
  try {
    const r = await sbGet('app_settings?key=eq.' + encodeURIComponent(key) + '&select=id,value');
    if (Array.isArray(r) && r.length) return { id: r[0].id, value: r[0].value || {} };
  } catch {
    /* table may not exist yet — treat as unset */
  }
  return { id: null, value: {} };
}
export async function saveSetting(key: string, value: any, knownId: string | null): Promise<string | null> {
  if (knownId) {
    await sbPatch('app_settings', knownId, { value, updated_at: new Date().toISOString() });
    return knownId;
  }
  const ex = await sbGet('app_settings?key=eq.' + encodeURIComponent(key) + '&select=id').catch(() => null);
  if (Array.isArray(ex) && ex.length) {
    await sbPatch('app_settings', ex[0].id, { value, updated_at: new Date().toISOString() });
    return ex[0].id;
  }
  const c = await sbPost('app_settings', { key, value });
  return Array.isArray(c) && c[0] ? c[0].id : null;
}

/* Slot windows are configured per dashboard in localStorage (the original's
   design, kept so an SM's own device keeps working offline and unchanged), but
   everyone ELSE — a shadower on their own phone, an admin on a fresh browser —
   has no copy of that config and would otherwise read stock labels for an
   id the office renamed. So each save also mirrors the windows into
   app_settings under `slots.<key>`, and readers with no local copy fall back
   to that. Best-effort in both directions: a failed mirror only costs the
   sharing, never the local save. */
export async function publishSlotConfig(key: string, slots: Array<{ id: string; label: string }>) {
  try {
    await saveSetting('slots.' + key, { slots }, null);
  } catch {
    /* sharing is an enhancement — the local config already saved */
  }
}
export async function fetchSharedSlotLabels(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const got = await Promise.all(keys.map((k) => loadSetting('slots.' + k).catch(() => ({ value: null }))));
  for (const g of got) {
    const list = g && g.value && Array.isArray(g.value.slots) ? g.value.slots : null;
    if (list) for (const s of list) if (s && s.id && s.label) out[s.id] = s.label;
  }
  return out;
}

/* PATCH every row matching a PostgREST filter, returning how many were
   changed. Only for backfills that would otherwise be hundreds of sequential
   id-PATCHes (linking legacy audit_orders to a BM account). Pass a filter
   narrow enough to be safe on its own — this cannot be undone per row. */
export async function sbPatchWhere(t: string, filter: string, b: any): Promise<number> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?' + filter, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(b),
      signal: ac.signal,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    const j = await r.json().catch(() => []);
    invalidateTable(t);
    return Array.isArray(j) ? j.length : 0;
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
  bm: { label: 'Business Manager', color: '#b45309' },
  coe: { label: 'Category Ops Executive', color: '#0369a1' },
  branch_mgr: { label: 'Branch Manager', color: '#be123c' },
};

/* ── Shadowers ────────────────────────────────────────────────────────────
   A site audit / installation sub-job can be shadowed (observed) by ANY
   number of registered people, of any role. They ride the existing
   shadower_email / shadower_name text columns comma-joined, so this needs no
   schema change — same encoding material-depot-site writes. */
export type Shadower = { email: string; name: string };

export function parseShadowers(emailStr?: string | null, nameStr?: string | null): Shadower[] {
  const es = String(emailStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ns = String(nameStr || '').split(',').map((s) => s.trim());
  return es.map((e, i) => ({ email: e, name: ns[i] || e }));
}
export function joinShadowers(list: Shadower[]): { email: string | null; name: string | null } {
  const clean = (list || []).filter((s) => s && s.email);
  if (!clean.length) return { email: null, name: null };
  return { email: clean.map((s) => s.email).join(','), name: clean.map((s) => s.name || s.email).join(',') };
}

/* ── Availability (profiles.weekly_off / profiles.leave_dates) ─────────────
   A weekday number (0=Sun) the person is always off, plus explicit leave
   dates. Both are advisory at assignment time — the SM can still override,
   exactly like the source app. */
export const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Availability = { weeklyOff: number | null; leaveDates: string[] };

/* ── Daily capacity (profiles.daily_cap / profiles.cap_overrides) ──────────
   How many jobs one auditor/installer can take on one day. Lives in the DB,
   not localStorage: caps used to sit in the SM's browser under
   `md_audit_caps`, which meant the other SM, the SM's own phone and — the
   reason it mattered — the public Store Team kiosk all disagreed about
   capacity. The kiosk didn't read caps at all and counted raw headcount.
   `dailyCap` null = fall back to the caller's default, so a roster row that
   no SM has touched behaves exactly as it did before. See
   site-audit-migration-003-staff-caps.sql. */
export type StaffCaps = { dailyCap: number | null; capOverrides: Record<string, number> };
export const CAPS_COLS = 'daily_cap,cap_overrides';

/* Probe-gated, because PostgREST fails the WHOLE select with 42703
   (undefined_column) if these columns aren't there yet — so asking for them
   before site-audit-migration-003 has been run would take out the roster query
   and with it the store kiosk's ability to book at all. Probed once and
   remembered; when the answer is unknown (network blip) we deliberately return
   the SAFE column list, which just means caps read as their defaults for that
   attempt — exactly the behaviour before this feature. Never the reverse:
   guessing "present" would turn a blip into an outage.
   `rosterSelect('id,name,city')` -> 'id,name,city,daily_cap,cap_overrides'. */
let capsReady: boolean | null = null;
export async function rosterSelect(cols: string): Promise<string> {
  if (capsReady === null) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/profiles?select=' + CAPS_COLS + '&limit=1', { headers: H });
      if (r.ok) capsReady = true;
      else {
        const body = await r.text().catch(() => '');
        // Only a missing column is a durable "no" — anything else is transient
        // and must not be latched.
        if (body.includes('42703')) capsReady = false;
        else console.error('[siteAudit] caps-column probe failed', r.status, body.slice(0, 200));
      }
    } catch (e) {
      console.error('[siteAudit] caps-column probe failed', e);
    }
  }
  return capsReady ? cols + ',' + CAPS_COLS : cols;
}
export function mapCaps(r: any): StaffCaps {
  return {
    dailyCap: r?.daily_cap == null ? null : Number(r.daily_cap),
    capOverrides: r?.cap_overrides && typeof r.cap_overrides === 'object' && !Array.isArray(r.cap_overrides)
      ? (r.cap_overrides as Record<string, number>)
      : {},
  };
}
/* Effective cap for one person on one date, or 0 when they are not working it.
   A per-date override wins over their default, which wins over `fallback`. */
export function staffCapOn(
  p: (Partial<Availability> & Partial<StaffCaps> & { activeFrom?: string | null }) | null | undefined,
  ds: string | null | undefined,
  fallback: number,
): number {
  if (!p || !ds) return fallback;
  if (p.activeFrom && ds < p.activeFrom) return 0;
  if (isOffDay(p, ds)) return 0;
  const o = p.capOverrides;
  if (o && o[ds] !== undefined && o[ds] !== null) return Math.max(0, Number(o[ds]) || 0);
  if (p.dailyCap != null) return Math.max(0, p.dailyCap);
  return fallback;
}

export function isOffDay(a: Partial<Availability> | null | undefined, ds?: string | null): boolean {
  if (!a || !ds) return false;
  if (a.weeklyOff != null && new Date(ds + 'T00:00:00').getDay() === a.weeklyOff) return true;
  if (Array.isArray(a.leaveDates) && a.leaveDates.includes(ds)) return true;
  return false;
}
export function offDayReason(a: Partial<Availability> | null | undefined, ds?: string | null): string {
  if (!isOffDay(a, ds)) return '';
  return Array.isArray(a?.leaveDates) && ds && a!.leaveDates!.includes(ds) ? 'on leave' : 'weekly off';
}

/* ── City scope ───────────────────────────────────────────────────────────
   Rows without a city are Bengaluru (the original city) — matching
   material-depot-site's `(o.city||'Bengaluru')` default everywhere. */
export const CITIES = ['Bengaluru', 'Hyderabad'];
export type CityFilter = 'all' | string;

export function cityOf(row: { city?: string | null } | null | undefined): string {
  return (row && row.city) || 'Bengaluru';
}
export function inCity<T extends { city?: string | null }>(list: T[], city: CityFilter): T[] {
  return city === 'all' ? list : list.filter((r) => cityOf(r) === city);
}
export function loadCityFilter(): CityFilter {
  if (typeof window === 'undefined') return 'all';
  try { return localStorage.getItem('md_city') || 'all'; } catch { return 'all'; }
}
export function saveCityFilter(c: CityFilter) {
  try { localStorage.setItem('md_city', c); } catch { /* best-effort */ }
}

/* Digits-only last-10 of a phone number — the CRM logs users in by phone
   (app/App.tsx `loginWithPhone`), while the Site Audit project stores staff
   numbers in `profiles.contact` with inconsistent +91 / spacing. Compare
   through this on both sides. */
/* The Role Viewer's preview links carry whose dashboard to open. Passing the
   raw email put a staff address in the address bar (and in history, and in any
   pasted link), so it travels base64url-encoded as `?p=`. This is tidiness, not
   access control — the route still requires a CRM session, and anyone can
   decode the value. `?person=` is still read for older links/bookmarks. */
export function encodePerson(email: string): string {
  try {
    return btoa(String(email)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}
export function decodePerson(v: string): string {
  try {
    const b = v.replace(/-/g, '+').replace(/_/g, '/');
    return atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  } catch {
    return '';
  }
}

export function phoneKey(p?: string | null): string {
  const d = String(p || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

/* The company-wide oversight rail, as a real slug rather than the absence of
   one. It used to be implied by permission_name being admin/tech, which meant
   the widest view in the product could not be withheld from anyone carrying
   those roles for unrelated reasons (finance, category, delivery) — 26 of the
   30 accounts that reached the rail had never been granted `crm.site_audit` at
   all. Only a permission can grant it now, so it can also be revoked. */
export const SITE_AUDIT_ADMIN_ROLE = 'admin';

/* Oversight has no field-app profile: it is a console over everyone else's
   work, not a person's own dashboard. Callers that provision a `profiles` row
   from a granted sub-role must skip this one, or every CRM admin silently
   becomes a field-app `admin` login. */
export function isSiteAuditOversightRole(role?: string | null): boolean {
  return role === SITE_AUDIT_ADMIN_ROLE;
}

// CRM individual_permissions slugs (set via the Admin > Users tab) that grant
// a Site Audit sub-view, mapped to the same role keys ROLES above uses.
// Replaces the old profiles.role-driven routing in app/site-audit-view/page.tsx.
export const SITE_AUDIT_PERMISSION_TO_ROLE: Record<string, string> = {
  'site_audit.site_auditor': 'site_auditor',
  'site_audit.installer': 'installer',
  'site_audit.service_manager': 'service_mgr',
  'site_audit.auditor_installer': 'auditor_installer',
  'site_audit.bm': 'bm',
  'site_audit.coe': 'coe',
  'site_audit.branch_mgr': 'branch_mgr',
  'site_audit.admin': SITE_AUDIT_ADMIN_ROLE,
};


export function siteAuditRoleFromPermissions(perms: string[] | undefined | null): string | null {
  if (!Array.isArray(perms)) return null;
  for (const slug of perms) {
    const role = SITE_AUDIT_PERMISSION_TO_ROLE[slug];
    if (role) return role;
  }
  return null;
}

/* ── Who the FIELD APP says this person is ─────────────────────────────────
   `profiles.role` here — not the CRM permission — is the company's working
   record of who does field work: it is what Site Audit > Users edits, and the
   CRM's Django permission list has no `service_mgr` value at all, so
   CRM_ROLE_TO_SITE_AUDIT_ROLE can only ever *infer* a service manager from a
   delivery/procurement-shaped permission. Real ones don't follow that shape —
   they turned up carrying `admin` (which routed them to the company-wide rail)
   and permissions the map has never heard of (which left them with no Site
   Audit tab at all). So the profile is consulted first and the CRM role is the
   fallback, for the many BMs and store managers never enrolled in the field
   app. */

/* profiles.role values that have a dashboard of their own inside
   SiteAuditOwnDashboard. `store_staff` is deliberately absent: the store team
   has its own standalone /store-booking route, so routing them here lands them
   on the "ask an admin for a sub-role" dead end. `admin` is absent because an
   admin's Site Audit home IS the oversight rail, which the CRM role grants;
   `content_team` has no view here at all. */
export const SITE_AUDIT_OWN_DASHBOARD_ROLES = new Set([
  'site_auditor', 'installer', 'auditor_installer', 'service_mgr', 'bm', 'coe', 'branch_mgr',
]);

/* The one query for "my own field-app profile", shared by app/App.tsx (which
   needs the role to decide the tab and which dashboard) and
   SiteAuditOwnDashboard (which needs id/name/email to render it). Kept as one
   literal so both callers produce the SAME cache key and cachedFetch collapses
   them into a single request instead of two.
   Matched on phoneKey() — profiles.contact is a clean 10-digit number on every
   row that has one, so normalising the CRM's side is all that's needed. Still
   exact matching; never a name, per orderBelongsToBm's rule. */
export const ownProfileQuery = (phone: string): string =>
  'profiles?contact=eq.' + encodeURIComponent(phoneKey(phone)) + '&select=id,name,email,role,branch';

/* One phone can carry more than one profile row — a field-app account created
   under a personal email alongside the company one (this exists in
   production). Prefer the row naming a dashboard we can actually render over
   whichever row PostgREST happened to return first. */
export function pickOwnProfile<T extends { role?: string | null }>(rows: T[]): T | null {
  return rows.find((r) => SITE_AUDIT_OWN_DASHBOARD_ROLES.has(String(r?.role || ''))) ?? rows[0] ?? null;
}

/* THROWS on a failed load rather than reporting "no profile": sbGet resolves a
   PostgREST error object instead of rejecting, and `null` here means "not in
   the field app", which the caller turns into an access decision. A dropped
   request must never read as a revoked role. */
export async function fetchOwnSiteAuditRole(phone: string): Promise<string | null> {
  if (!phoneKey(phone)) return null;
  const rows = await sbGet(ownProfileQuery(phone));
  if (!Array.isArray(rows)) throw new Error('Site Audit profile lookup failed');
  const role = pickOwnProfile(rows)?.role;
  return typeof role === 'string' && role ? role : null;
}

/* Provisions/updates the Site Audit `profiles` row for someone granted a
   Site Audit sub-role from the CRM's own Admin > Users screen — the mirror
   of what SiteAuditUsersView.tsx's "Create CRM login" already does in the
   other direction. Keeps a person's field-app identity (name/role/contact)
   in sync with their CRM record without a second manual entry screen.
   Matched by email (profiles' natural unique key, unlike phone which the
   field apps don't always have yet); a profile that already exists under
   that email is updated in place rather than duplicated. */
export async function upsertSiteAuditProfile({ name, email, phone, role }: {
  name: string; email: string; phone: string; role: string;
}): Promise<void> {
  const em = email.trim().toLowerCase();
  if (!em) return;
  // Oversight is a console, not a person's dashboard — it has no profile row.
  if (isSiteAuditOversightRole(role)) return;
  const existing = await sbGet('profiles?email=eq.' + encodeURIComponent(em) + '&select=id').catch(() => null);
  const body = { name, role, contact: phone || null };
  if (Array.isArray(existing) && existing[0]) {
    await sbPatch('profiles', existing[0].id, body);
  } else {
    await sbPost('profiles', { ...body, email: em, city: 'Bengaluru', installer_type: 'flooring', passcode: null });
  }
}

/* ── CRM permission_name → Site Audit role ─────────────────────────────────
   The company's master employee/permission list lives in the CRM's own
   Django backend (lib/mockApi.ts fetchUsers(), permission_name values like
   'sales'/'manager'/'delivery'/'procurement'), separate from the Site Audit
   role above. This maps that permission to the Site Audit role it should
   grant, so access here is derived from the CRM instead of assigned twice by
   hand. `null` means "should have NO Site Audit access" — a real, meaningful
   target the sync surfaces but never auto-applies (see planSiteAuditRoleSync
   below — revoking is a human decision, granting isn't). Confirmed with the
   business 2026-08: accounts/retail/customer_success/data/pre_sales get
   none; b2b_KAM/b2b_manager/b2b_sales/sales are BMs; delivery/delivery_manager/
   post_sales/procurement are Service Managers; manager/store_manager are the
   new branch-rollup role. `admin` and `tech` are absent on purpose — see
   OVERSIGHT_CRM_ROLES below. */
export const CRM_ROLE_TO_SITE_AUDIT_ROLE: Record<string, string | null> = {
  accounts: null,
  retail: null,
  customer_success: null,
  data: null,
  pre_sales: null,
  b2b_KAM: 'bm',
  b2b_manager: 'bm',
  b2b_sales: 'bm',
  sales: 'bm',
  delivery: 'service_mgr',
  delivery_manager: 'service_mgr',
  post_sales: 'service_mgr',
  procurement: 'service_mgr',
  manager: 'branch_mgr',
  store_manager: 'branch_mgr',
};

/* `field_worker` covers both site auditors and installers with nothing in the
   CRM permission to tell them apart, so it's deliberately absent from the map
   above rather than mapped to null — null means "revoke," this means "hands
   off, don't even compare." Any permission_name this map has never heard of
   (a future addition on the Django side) is treated the same way: never guess
   at a mapping, just skip. */
export const FIELD_WORKER_SKIP = 'skip' as const;

/* CRM roles whose Site Audit access is the company-wide oversight rail, granted
   by the CRM session alone (SITE_AUDIT_OVERSIGHT_ROLES in app/App.tsx). They
   need no field-app profile at all, so the sync neither creates one nor revokes
   one they happen to have — "hands off", like field_worker. Mapping them to a
   real role instead would have the sync silently create a field-app `admin`
   account for every CRM admin; mapping them to null would flag the ones who
   already have a profile as "no longer entitled" while the CRM is actively
   granting them the widest view in the product. */
export const OVERSIGHT_CRM_ROLES = new Set(['admin', 'superadmin', 'tech']);

export function siteAuditTargetForCrmPermission(perm: string): string | null | typeof FIELD_WORKER_SKIP {
  if (perm === 'field_worker') return FIELD_WORKER_SKIP;
  if (OVERSIGHT_CRM_ROLES.has(perm)) return FIELD_WORKER_SKIP;
  if (perm in CRM_ROLE_TO_SITE_AUDIT_ROLE) return CRM_ROLE_TO_SITE_AUDIT_ROLE[perm];
  return FIELD_WORKER_SKIP;
}

/* Roles a CRM-permission sync must never touch, regardless of what the
   person's CRM permission computes to: `store_staff` has no CRM counterpart
   at all (sourced entirely outside the CRM, from the field app's own kiosk
   flow); `coe` and `content_team` are hand-assigned with no CRM permission
   mapping to either. A naive sync reading "no matching CRM role" (or a CRM
   role that happens to map to something else) as license to overwrite any
   of these would silently clobber a real, intentional assignment. */
const PROTECTED_ROLES = new Set(['store_staff', 'coe', 'content_team', 'service_mgr']);

/* `service_mgr` joined that set for the same reason the field-work roles are
   exempt below: nothing in a CRM permission can disprove it. A service manager
   routinely carries `manager` or `sales` as their cost centre, and the sync used
   to read that as licence to demote a real service desk to the branch rollup —
   it would have flipped uo 10 (profile service_mgr, CRM role manager) straight
   back after a human had corrected it. Promotion still works: someone whose CRM
   role already maps to service_mgr matches the target and is a no-op, so this
   only ever blocks the demotion. */

/* Roles that DO the field work. Their jobs are keyed to the profile — an
   auditor's queue is `audit_orders.auditor_email`, an installer's is their own
   sub-jobs — so flipping one of these to a desk role silently empties a real
   person's dashboard. The CRM permission is not evidence they stopped doing
   field work: it routinely says `sales`/`post_sales` for someone who audits
   sites every day (HR records the cost centre, not the job). `field_worker` is
   the only CRM permission that means "field staff", and it can't tell auditor
   from installer, so it's skipped too — which leaves NO CRM permission that
   can justify demoting one of these. Surfaced for a human instead. */
const FIELD_WORK_ROLES = new Set(['site_auditor', 'installer', 'auditor_installer']);

export type SiteAuditRoleSyncCrmUser = { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[]; active?: boolean };
export type SiteAuditRoleSyncProfile = { id: string; name: string; email: string; role: string; contact: string | null };

export type SiteAuditRoleSyncPlan = {
  ready: Array<{ profileId: string; name: string; email: string; crmPermission: string; currentRole: string; targetRole: string; branch: string | null }>;
  noProfileYet: Array<{ crmUserId: string | number; name: string; phone: string; crmPermission: string; targetRole: string; branch: string | null }>;
  skipped: Array<{ name: string; reason: 'field_worker' | 'protected_role' | 'field_work_role' | 'oversight_role' | 'ambiguous_phone' | 'unmapped_permission' }>;
  noLongerEntitled: Array<{ profileId: string; name: string; email: string; currentRole: string; crmPermission: string }>;
};

/* Pure — no network calls, so it's cheap to unit-test and safe to preview
   before any write happens. Buckets every CRM user / Site Audit profile pair
   by phoneKey() (the CRM has no email at all, only phone — see fetchUsers()),
   applying the protection rules above in order: ambiguous match, then
   protected role, then field_worker, then the mapping. Nothing in `ready` or
   `noProfileYet` is ever written by this function itself — the caller decides
   whether/when to apply it, after a human reviews the preview. */
export function planSiteAuditRoleSync(
  allCrmUsers: SiteAuditRoleSyncCrmUser[],
  profiles: SiteAuditRoleSyncProfile[],
): SiteAuditRoleSyncPlan {
  const plan: SiteAuditRoleSyncPlan = { ready: [], noProfileYet: [], skipped: [], noLongerEntitled: [] };

  /* Deactivated employees are dropped before anything else, silently: the CRM
     roster keeps them so Admin > Users can manage them, but they are not a
     reason to grant field-app access, and listing them as "skipped" would bury
     the skips that a human actually needs to look at. Dropping them here also
     keeps them out of the phone-ambiguity maps, so an ex-employee sharing a
     recycled number no longer makes their replacement unresolvable. */
  const crmUsers = allCrmUsers.filter((u) => u.active !== false);

  const profilesByPhone = new Map<string, SiteAuditRoleSyncProfile[]>();
  for (const p of profiles) {
    const key = phoneKey(p.contact);
    if (!key) continue;
    const list = profilesByPhone.get(key) || [];
    list.push(p);
    profilesByPhone.set(key, list);
  }
  const crmByPhone = new Map<string, SiteAuditRoleSyncCrmUser[]>();
  for (const u of crmUsers) {
    const key = phoneKey(u.phone);
    if (!key) continue;
    const list = crmByPhone.get(key) || [];
    list.push(u);
    crmByPhone.set(key, list);
  }

  for (const crmUser of crmUsers) {
    const key = phoneKey(crmUser.phone);
    const matchedProfiles = key ? profilesByPhone.get(key) || [] : [];
    const matchedCrmUsers = key ? crmByPhone.get(key) || [] : [];

    // Ambiguous either direction (0 or 2+ matches) — never guess.
    if (matchedProfiles.length > 1 || matchedCrmUsers.length > 1) {
      plan.skipped.push({ name: crmUser.name, reason: 'ambiguous_phone' });
      continue;
    }
    const profile = matchedProfiles[0] || null;

    if (profile && PROTECTED_ROLES.has(profile.role)) {
      plan.skipped.push({ name: crmUser.name, reason: 'protected_role' });
      continue;
    }
    if (profile && FIELD_WORK_ROLES.has(profile.role)) {
      plan.skipped.push({ name: crmUser.name, reason: 'field_work_role' });
      continue;
    }
    if (crmUser.role === 'field_worker') {
      plan.skipped.push({ name: crmUser.name, reason: 'field_worker' });
      continue;
    }
    if (OVERSIGHT_CRM_ROLES.has(crmUser.role)) {
      plan.skipped.push({ name: crmUser.name, reason: 'oversight_role' });
      continue;
    }

    const target = siteAuditTargetForCrmPermission(crmUser.role);
    /* `profiles.branch` is a single text column, so it can only ever record a
       one-branch person. Stamping `allowedBranches[0]` for someone with two
       would not just lose the rest — it would NARROW them, because a stamped
       branch outranks the CRM list when their dashboard resolves its scope.
       null means "don't write a branch", never "clear the branch": the apply
       step omits the column entirely rather than nulling what's there. */
    const branch = crmUser.allowedBranches?.length === 1 ? crmUser.allowedBranches[0] : null;

    if (target === FIELD_WORKER_SKIP) {
      plan.skipped.push({ name: crmUser.name, reason: 'unmapped_permission' });
      continue;
    }
    if (target === null) {
      if (profile && profile.role) {
        plan.noLongerEntitled.push({ profileId: profile.id, name: profile.name, email: profile.email, currentRole: profile.role, crmPermission: crmUser.role });
      }
      continue;
    }
    // Real target role from here on.
    if (!profile) {
      plan.noProfileYet.push({ crmUserId: crmUser.id, name: crmUser.name, phone: crmUser.phone, crmPermission: crmUser.role, targetRole: target, branch });
      continue;
    }
    if (profile.role === target) continue; // already correct, nothing to do

    plan.ready.push({ profileId: profile.id, name: profile.name, email: profile.email, crmPermission: crmUser.role, currentRole: profile.role, targetRole: target, branch });
  }

  return plan;
}

/* A stable, deterministic placeholder identity for a CRM user who has no
   Site Audit profile yet (the CRM has no email at all — see planSiteAuditRoleSync
   above). This is never meant to be typed in or logged into anywhere — the
   person's real access is entirely via their CRM session, which resolves Site
   Audit identity by phone (profiles.contact), not by this email at all (see
   SiteAuditOwnDashboard). It exists purely so profiles.email can keep serving
   as the join key other code already relies on (bm_email on audit_orders,
   Role Viewer's person list, etc.) — same value every time for the same
   phone, so re-running the sync never creates a duplicate profile. */
export function syntheticSiteAuditEmail(phone: string): string {
  return 'crm.' + phoneKey(phone) + '@site-audit.internal';
}

/* A random 4-digit passcode (this table's existing format — see
   upsertSiteAuditProfile, which instead sets `passcode: null` when a person
   IS expected to set their own PIN on first direct login). For a profile
   auto-created by the CRM sync, nobody is ever meant to use the separate
   material-depot-site Login.html page at all — a real, random, uncommunicated
   passcode blocks that page's "first login sets the PIN" flow from letting
   anyone opportunistically claim the account there. */
export function randomPasscode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

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

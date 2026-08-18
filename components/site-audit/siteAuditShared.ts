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
};

export function siteAuditRoleFromPermissions(perms: string[] | undefined | null): string | null {
  if (!Array.isArray(perms)) return null;
  for (const slug of perms) {
    const role = SITE_AUDIT_PERMISSION_TO_ROLE[slug];
    if (role) return role;
  }
  return null;
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
   business 2026-08: accounts/retail/customer_success/data/pre_sales/tech get
   none; b2b_KAM/b2b_manager/b2b_sales/sales are BMs; delivery/delivery_manager/
   post_sales/procurement are Service Managers; manager/store_manager are the
   new branch-rollup role. */
export const CRM_ROLE_TO_SITE_AUDIT_ROLE: Record<string, string | null> = {
  admin: 'admin',
  accounts: null,
  retail: null,
  customer_success: null,
  data: null,
  pre_sales: null,
  tech: null,
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

export function siteAuditTargetForCrmPermission(perm: string): string | null | typeof FIELD_WORKER_SKIP {
  if (perm === 'field_worker') return FIELD_WORKER_SKIP;
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
const PROTECTED_ROLES = new Set(['store_staff', 'coe', 'content_team']);

export type SiteAuditRoleSyncCrmUser = { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[] };
export type SiteAuditRoleSyncProfile = { id: string; name: string; email: string; role: string; contact: string | null };

export type SiteAuditRoleSyncPlan = {
  ready: Array<{ profileId: string; name: string; email: string; crmPermission: string; currentRole: string; targetRole: string; branch: string | null }>;
  noProfileYet: Array<{ crmUserId: string | number; name: string; phone: string; crmPermission: string; targetRole: string; branch: string | null }>;
  skipped: Array<{ name: string; reason: 'field_worker' | 'protected_role' | 'ambiguous_phone' | 'unmapped_permission' }>;
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
  crmUsers: SiteAuditRoleSyncCrmUser[],
  profiles: SiteAuditRoleSyncProfile[],
): SiteAuditRoleSyncPlan {
  const plan: SiteAuditRoleSyncPlan = { ready: [], noProfileYet: [], skipped: [], noLongerEntitled: [] };

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
    if (crmUser.role === 'field_worker') {
      plan.skipped.push({ name: crmUser.name, reason: 'field_worker' });
      continue;
    }

    const target = siteAuditTargetForCrmPermission(crmUser.role);
    const branch = crmUser.allowedBranches?.[0] ?? null;

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

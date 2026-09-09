import { sbGet } from './sbClient';
import { exitSelect } from './staffExit';
import { phoneKey } from './identity';

/* Who the FIELD APP says this person is. `profiles.role` — not the CRM
   permission — is the working record of who does field work; the CRM role is
   only the fallback, for the BMs and store managers never enrolled here. */

/* Roles with a dashboard of their own in SiteAuditOwnDashboard. `store_staff`
   is absent (own /store-booking route), `admin` too (its home is the oversight
   rail), `content_team` has no view here. */
export const SITE_AUDIT_OWN_DASHBOARD_ROLES = new Set([
  'site_auditor', 'installer', 'auditor_installer', 'service_mgr', 'bm', 'coe', 'branch_mgr',
]);

/* One literal, so App.tsx and SiteAuditOwnDashboard produce the same cache key
   and cachedFetch collapses them into one request. Async only because
   `deleted_at` is probe-gated (migration 004). The retired filter stays OUT of
   the query — it is judged in pickOwnProfile, so a person with two profile rows
   still resolves to their live one instead of to nothing. */
export async function ownProfileQuery(phone: string): Promise<string> {
  return 'profiles?contact=eq.' + encodeURIComponent(phoneKey(phone))
    + '&select=' + await exitSelect('id,name,email,role,branch');
}

/* One phone can carry two profile rows (a personal email alongside the company
   one). Prefer the row naming a dashboard we can render. All rows retired ⇒
   null: a leaver must not get a field dashboard even if the Django
   deactivation, a separate write, failed on its own. */
export function pickOwnProfile<T extends { role?: string | null; deleted_at?: string | null }>(rows: T[]): T | null {
  const live = rows.filter((r) => !r?.deleted_at);
  if (!live.length) return null;
  return live.find((r) => SITE_AUDIT_OWN_DASHBOARD_ROLES.has(String(r?.role || ''))) ?? live[0] ?? null;
}

/* THROWS on a failed load rather than reporting "no profile": sbGet resolves
   errors instead of rejecting, and null here becomes an access decision. A
   dropped request must never read as a revoked role. */
export async function fetchOwnSiteAuditRole(phone: string): Promise<string | null> {
  if (!phoneKey(phone)) return null;
  const rows = await sbGet(await ownProfileQuery(phone));
  if (!Array.isArray(rows)) throw new Error('Site Audit profile lookup failed');
  const role = pickOwnProfile(rows)?.role;
  return typeof role === 'string' && role ? role : null;
}

import { sbGet } from '../sb-client';
import { exitSelect } from '../staff/exit';
import { phoneKey } from '.';

export const SITE_AUDIT_OWN_DASHBOARD_ROLES = new Set([
  'site_auditor', 'installer', 'auditor_installer', 'service_mgr', 'bm', 'coe', 'branch_mgr',
]);

export async function ownProfileQuery(phone: string): Promise<string> {
  return 'profiles?contact=eq.' + encodeURIComponent(phoneKey(phone))
    + '&select=' + await exitSelect('id,name,email,role,branch');
}

export function pickOwnProfile<T extends { role?: string | null; deleted_at?: string | null }>(rows: T[]): T | null {
  const live = rows.filter((r) => !r?.deleted_at);
  if (!live.length) return null;
  return live.find((r) => SITE_AUDIT_OWN_DASHBOARD_ROLES.has(String(r?.role || ''))) ?? live[0] ?? null;
}

export async function fetchOwnSiteAuditRole(phone: string): Promise<string | null> {
  if (!phoneKey(phone)) return null;
  const rows = await sbGet(await ownProfileQuery(phone));
  if (!Array.isArray(rows)) throw new Error('Site Audit profile lookup failed');
  const role = pickOwnProfile(rows)?.role;
  return typeof role === 'string' && role ? role : null;
}

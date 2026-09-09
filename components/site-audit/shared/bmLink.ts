import { sbGet, sbPatch, sbPost } from './sbClient';
import { phoneKey } from './identity';
import { isSiteAuditOversightRole } from './roles';

export function bmPhoneOfOrder(row: { bm?: string | null; bm_email?: string | null }): string {
  const em = String(row.bm_email || '');
  const synthetic = /^crm\.(\d{10})@site-audit\.internal$/i.exec(em.trim());
  if (synthetic) return synthetic[1];
  return phoneKey(row.bm);
}

export async function fetchBmEmailsByPhone(): Promise<Map<string, string>> {
  const rows = await sbGet('profiles?select=email,contact&role=eq.bm').catch(() => []);
  const seen = new Map<string, string | null>();
  if (Array.isArray(rows)) {
    for (const r of rows as Array<{ email?: string; contact?: string | null }>) {
      const key = phoneKey(r.contact);
      if (!key || !r.email) continue;
      seen.set(key, seen.has(key) ? null : r.email);
    }
  }
  const out = new Map<string, string>();
  for (const [k, v] of seen) if (v) out.set(k, v);
  return out;
}

export async function upsertSiteAuditProfile({ name, email, phone, role }: {
  name: string; email: string; phone: string; role: string;
}): Promise<void> {
  const em = email.trim().toLowerCase();
  if (!em) return;

  if (isSiteAuditOversightRole(role)) return;
  const existing = await sbGet('profiles?email=eq.' + encodeURIComponent(em) + '&select=id').catch(() => null);
  const body = { name, role, contact: phone || null };
  if (Array.isArray(existing) && existing[0]) {
    await sbPatch('profiles', existing[0].id, body);
  } else {
    await sbPost('profiles', { ...body, email: em, city: 'Bengaluru', installer_type: 'flooring', passcode: null });
  }
}

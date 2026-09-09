import { sbGet, sbPatch, sbPost } from './sbClient';
import { phoneKey } from './identity';
import { isSiteAuditOversightRole } from './roles';

/* The digits an order's BM link carries, or ''. For a BM the CRM sync created
   (or who has no account at all) the link IS the phone —
   `crm.<10 digits>@site-audit.internal` — so attribution compares the PHONE
   and resolves before any field-app account exists. Falls back to digits typed
   into the free-text `bm` field. */
export function bmPhoneOfOrder(row: { bm?: string | null; bm_email?: string | null }): string {
  const em = String(row.bm_email || '');
  const synthetic = /^crm\.(\d{10})@site-audit\.internal$/i.exec(em.trim());
  if (synthetic) return synthetic[1];
  return phoneKey(row.bm);
}

/* Phone → BM profile email: the one exact join between an order and a BM
   account. Names never resolve it (all 87 live BM rows hold a first name,
   "Anubhab" against an order saying "Anubhab Sarkar"), but the CRM roster and
   `profiles.contact` carry the same 10 digits. Every `bm_email` writer goes
   through this. A number on two BM profiles is dropped, not guessed — a wrong
   link shows one BM another BM's customer. */
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

/* Provisions the `profiles` row for someone granted a Site Audit sub-role from
   the CRM's Admin > Users — the mirror of SiteAuditUsersView's "Create CRM
   login". Matched by email, profiles' natural key (phone isn't always there
   yet), so an existing row is updated rather than duplicated. */
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

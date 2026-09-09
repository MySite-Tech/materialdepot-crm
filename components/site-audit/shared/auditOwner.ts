import { sbGet } from './sbClient';
import { phoneKey } from './identity';
import { bmPhoneOfOrder, fetchBmEmailsByPhone } from './bmLink';
import { syntheticSiteAuditEmail } from './roleSync';

/* ── An audit order must never be written without an owner ─────────────────
   `bm_email` unset is not a cosmetic gap: the row then reaches a BM dashboard only by matching
   free text against `profiles.name`, which is why a queue of "link these by hand" built up.
   Rather than fix each writer and hope the next one remembers, sbPost() routes every
   audit_orders insert through this.

   The identity being resolved is the PHONE, not the address — see bmPhoneOfOrder. `bm_email`
   holds a real profile address when an account exists and the deterministic
   crm.<10-digits>@site-audit.internal form when it does not, so attribution works before anyone
   has a field-app profile. Resolution order, most authoritative first:
     1. the enquiry's owner from the backend (the estimate's manager assignment) — this is what
        makes a rectification clone and a hand-typed order land on the right dashboard
     2. digits already in the free-text `bm` field
     3. an exact BM-profile name match
   A store pre-booking made before any enquiry exists has no knowable owner; that row is left for
   the store team to assign rather than given a fabricated one, and `bm` is never left holding a
   store name pretending to be a person. */
const ENQUIRY_RE = /ENQ\d+/;

export function enquiryIdFrom(pi?: string | null, po?: string | null): string | null {
  const hit = ENQUIRY_RE.exec(String(pi || '') + ' ' + String(po || ''));
  return hit ? hit[0] : null;
}

/* One narrow lookup, not the paged backfill resolveBmFromBackend runs: this is on the write path
   and only ever needs a single enquiry. */
async function fetchBmContactForEnquiry(enquiry: string): Promise<{ name: string; contact: string } | null> {
  const { getToken } = await import('@/lib/mockApi');
  const token = getToken();
  for (const type of ['site_audit', 'installation']) {
    try {
      const res = await fetch(
        `/api/site-audit/install-pos?type=${type}&page_size=5&search=${encodeURIComponent(enquiry)}`,
        { headers: token ? { Authorization: 'Bearer ' + token } : undefined },
      );
      const data = await res.json().catch(() => null);
      const rows = data && Array.isArray(data.results) ? data.results : [];
      for (const r of rows) {
        if (String((r && r.estimate_lead_id) || '').trim() !== enquiry) continue;
        const contact = r.bm && r.bm.contact != null ? String(r.bm.contact) : '';
        if (phoneKey(contact)) return { name: (r.bm && r.bm.name) || '', contact };
      }
    } catch { /* the guard must never block a field save */ }
  }
  return null;
}

export async function ensureAuditOrderOwner(body: any): Promise<any> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  if (phoneKey(bmPhoneOfOrder(body)) || String(body.bm_email || '').trim()) return body;

  let phone = '';
  let name = '';

  const enquiry = enquiryIdFrom(body.pi, body.po);
  if (enquiry) {
    const owner = await fetchBmContactForEnquiry(enquiry);
    if (owner) { phone = owner.contact; name = owner.name || ''; }
  }
  if (!phoneKey(phone)) phone = phoneKey(body.bm);
  if (!phoneKey(phone)) {
    const target = String(body.bm || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (target) {
      const rows = await sbGet('profiles?select=name,contact&role=eq.bm').catch(() => []);
      const hits = (Array.isArray(rows) ? rows : []).filter(
        (r: any) => String(r.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === target && phoneKey(r.contact),
      );
      // Two BMs on one name is ambiguous; a wrong link shows one BM another's customer.
      if (hits.length === 1) phone = String(hits[0].contact);
    }
  }
  if (!phoneKey(phone)) return body;

  const byPhone = await fetchBmEmailsByPhone().catch(() => new Map<string, string>());
  const key = phoneKey(phone);
  return {
    ...body,
    bm: name || body.bm || '—',
    bm_email: byPhone.get(key) || syntheticSiteAuditEmail(key),
  };
}


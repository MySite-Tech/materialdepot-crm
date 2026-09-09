import { sbGet } from '../sb-client';
import { phoneKey } from '../identity';
import { bmPhoneOfOrder, fetchBmEmailsByPhone } from './bm-link';
import { syntheticSiteAuditEmail } from '../identity/role-sync';

const ENQUIRY_RE = /ENQ\d+/;

export function enquiryIdFrom(pi?: string | null, po?: string | null): string | null {
  const hit = ENQUIRY_RE.exec(String(pi || '') + ' ' + String(po || ''));
  return hit ? hit[0] : null;
}

async function fetchBmContactForEnquiry(enquiry: string): Promise<{ name: string; contact: string } | null> {
  const { getToken } = await import('@/lib/api');
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


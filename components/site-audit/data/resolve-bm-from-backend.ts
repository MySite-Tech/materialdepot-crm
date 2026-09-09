import { fetchBmEmailsByPhone, phoneKey, sbGet, sbPatchWhere, syntheticSiteAuditEmail } from '../shared';
import { getToken } from '@/lib/api';

const PAGE_SIZE = 200;

const MAX_PAGES = 10;

type BmOwner = { name: string; contact: string };

async function fetchBmOwnersByEnquiry(): Promise<{ owners: Map<string, BmOwner>; truncated: boolean }> {
  const token = getToken();
  const owners = new Map<string, BmOwner>();
  let truncated = false;

  for (const type of ['site_audit', 'installation']) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`/api/site-audit/install-pos?type=${type}&page_size=${PAGE_SIZE}&page=${page}`, {
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      });
      const data = await res.json().catch(() => null);
      const rows = data && Array.isArray(data.results) ? data.results : null;
      if (!rows) break;
      for (const r of rows) {
        const lead = String((r && r.estimate_lead_id) || '').trim();
        const contact = r && r.bm && r.bm.contact != null ? String(r.bm.contact) : '';
        if (!lead || !phoneKey(contact) || owners.has(lead)) continue;
        owners.set(lead, { name: (r.bm && r.bm.name) || '', contact });
      }
      if (rows.length < PAGE_SIZE) break;
      if (page === MAX_PAGES) truncated = true;
    }
  }
  return { owners, truncated };
}

function enquiryIdOf(row: { pi?: string | null; po?: string | null }): string | null {
  const hit = /ENQ\d+/.exec(String(row.pi || '') + ' ' + String(row.po || ''));
  return hit ? hit[0] : null;
}

export type BmResolvePlan = {

  ready: Array<{ id: string; enquiry: string; name: string; email: string }>;

  needAccount: Array<{ name: string; contact: string; rows: number }>;

  unresolved: number;
  truncated: boolean;
};

export async function planBmResolve(
  rows: Array<{ id: string; pi?: string | null; po?: string | null }>,
): Promise<BmResolvePlan> {
  const [{ owners, truncated }, bmEmails] = await Promise.all([
    fetchBmOwnersByEnquiry(),
    fetchBmEmailsByPhone(),
  ]);

  const ready: BmResolvePlan['ready'] = [];
  const need = new Map<string, { name: string; contact: string; rows: number }>();
  let unresolved = 0;

  for (const row of rows) {
    const enquiry = enquiryIdOf(row);
    const owner = enquiry ? owners.get(enquiry) : null;
    if (!enquiry || !owner) { unresolved++; continue; }
    const key = phoneKey(owner.contact);

    const email = bmEmails.get(key) || syntheticSiteAuditEmail(owner.contact);
    ready.push({ id: row.id, enquiry, name: owner.name, email });
    if (!bmEmails.get(key)) {
      const seen = need.get(key) || { name: owner.name, contact: key, rows: 0 };
      seen.rows += 1;
      need.set(key, seen);
    }
  }

  return {
    ready,
    needAccount: [...need.values()].sort((a, b) => b.rows - a.rows),
    unresolved,
    truncated,
  };
}

export async function applyBmResolve(plan: BmResolvePlan): Promise<number> {
  const byEmail = new Map<string, { name: string; ids: string[] }>();
  for (const r of plan.ready) {
    const slot = byEmail.get(r.email) || { name: r.name, ids: [] };
    slot.ids.push(r.id);
    byEmail.set(r.email, slot);
  }
  let done = 0;
  for (const [email, { name, ids }] of byEmail) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        done += await sbPatchWhere(
          'audit_orders',
          'id=in.(' + chunk.map(encodeURIComponent).join(',') + ')&bm_email=is.null',
          { bm: name, bm_email: email },
        );
      } catch { /* keep going; the caller reports the total that landed */ }
    }
  }
  return done;
}

export async function fetchUnlinkedAuditOrders(): Promise<Array<{ id: string; pi: string | null; po: string | null; bm: string | null }>> {
  const rows = await sbGet('audit_orders?select=id,pi,po,bm&bm_email=is.null&status=not.in.(deleted,slot_reserved,slot_converted)');
  return Array.isArray(rows) ? rows : [];
}

export async function autoLinkBmsFromRows(
  backendRows: Array<{ estimate_lead_id?: string; bm?: { name?: string; contact?: number | string } | null }>,
): Promise<number> {
  const owners = new Map<string, BmOwner>();
  for (const r of backendRows) {
    const lead = String((r && r.estimate_lead_id) || '').trim();
    const contact = r && r.bm && r.bm.contact != null ? String(r.bm.contact) : '';
    if (!lead || !phoneKey(contact) || owners.has(lead)) continue;
    owners.set(lead, { name: (r.bm && r.bm.name) || '', contact });
  }
  if (!owners.size) return 0;

  const unlinked = await fetchUnlinkedAuditOrders().catch(() => []);
  if (!unlinked.length) return 0;

  const bmEmails = await fetchBmEmailsByPhone().catch(() => new Map<string, string>());
  if (!bmEmails.size) return 0;

  const plan: BmResolvePlan = { ready: [], needAccount: [], unresolved: 0, truncated: false };
  for (const row of unlinked) {
    const enquiry = enquiryIdOf(row);
    const owner = enquiry ? owners.get(enquiry) : null;
    if (!owner) continue;
    const email = bmEmails.get(phoneKey(owner.contact));
    if (email) plan.ready.push({ id: row.id, enquiry: enquiry as string, name: owner.name, email });
  }
  if (!plan.ready.length) return 0;
  return applyBmResolve(plan).catch(() => 0);
}

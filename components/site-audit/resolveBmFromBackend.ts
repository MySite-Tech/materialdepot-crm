/* Who owns an audit order, taken from the backend instead of guessed from a name.

   `audit_orders.bm` is free text — typed at a store counter, prefilled from a
   Kylas payload, or a first name — so matching it against an account is a
   guessing game that leaves rows unattributed ("Janvi" for the account
   "Jhanvi", "Whitefield" for a store). None of that is necessary: the same
   endpoint the auto-import already reads returns the enquiry's real owner,
   `bm: { name, contact }`, resolved backend-side from the estimate's manager
   assignment. Phone is the join to `profiles`, exactly as everywhere else.

   No new backend surface — this pages through the list the CRM is already
   entitled to read. */

import { fetchBmEmailsByPhone, phoneKey, sbGet, sbPatchWhere, syntheticSiteAuditEmail } from './siteAuditShared';
import { getToken } from '@/lib/mockApi';

const PAGE_SIZE = 200;
/* The endpoint reaches back over the whole history; this caps a backfill at
   ~2000 jobs per kind, which is far beyond the CRM's own table. `logSkipped`
   tells the caller when the cap actually bit, so a partial pass never reads as
   a complete one. */
const MAX_PAGES = 10;

export type BmOwner = { name: string; contact: string };

/* Enquiry id → its owner. Both job types are read: an audit order's enquiry can
   appear under either, and the owner is a property of the enquiry, not the job. */
export async function fetchBmOwnersByEnquiry(): Promise<{ owners: Map<string, BmOwner>; truncated: boolean }> {
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

/* An audit order's enquiry id lives in `pi` for CRM-created rows and in `po`
   for store pre-bookings, whose `pi` is the generated SRES-… slot id. */
export function enquiryIdOf(row: { pi?: string | null; po?: string | null }): string | null {
  const hit = /ENQ\d+/.exec(String(row.pi || '') + ' ' + String(row.po || ''));
  return hit ? hit[0] : null;
}

export type BmResolvePlan = {
  /* Rows whose owner has an account — ready to link, grouped by that account. */
  ready: Array<{ id: string; enquiry: string; name: string; email: string }>;
  /* Owners the backend named who have no Site Audit account yet. Nothing about
     their CRM permission is consulted: the assignment IS the answer, and the
     largest client book in the company carries the label `manager`. */
  needAccount: Array<{ name: string; contact: string; rows: number }>;
  /* Rows the backend could not answer for — no enquiry id on the row, or the
     enquiry is absent from the feed. They stay linkable by hand. */
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
    /* No account? Still link, on the number. The synthetic address IS the
       phone (see bmPhoneOfOrder), a BM's CRM session resolves by phone, and
       creating the account later produces this very same address — so the row
       needs no rewrite when it happens. `needAccount` is now a nudge to give
       the person a dashboard, not a precondition for attribution. */
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

/* One PATCH per (account, enquiry-set) rather than per row: the filter re-asserts
   `bm_email=is.null` so a row linked by someone else meanwhile is skipped, the
   same guard the by-name backfill uses. */
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

/* The unlinked rows themselves, with the two columns an enquiry id can hide in. */
export async function fetchUnlinkedAuditOrders(): Promise<Array<{ id: string; pi: string | null; po: string | null; bm: string | null }>> {
  const rows = await sbGet('audit_orders?select=id,pi,po,bm&bm_email=is.null&status=neq.deleted');
  return Array.isArray(rows) ? rows : [];
}

/* The same resolution, run from rows the caller has ALREADY fetched — no extra
   backend request. The auto-import reconcile calls this with its own page of
   jobs, so a store pre-booking typed as "Janvi" is attributed within a page
   load of the enquiry reaching the feed, with nobody pressing anything. The
   Users-tab button stays for the historical backlog, which reaches further back
   than any reconcile page.

   Silent by design apart from its return value: attribution repairing itself is
   not something a dashboard needs to announce, and it must never take a view
   down (every failure path resolves to 0). */
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

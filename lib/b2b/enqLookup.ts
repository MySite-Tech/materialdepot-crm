import { LeadDeal } from '@/components/b2b/models/mockData';
import { fetchCRMLeads } from '@/lib/mockApi';
// ── Order value from the Enq ID (PRD §3.4 / §3.5) ────────────────────────────
//
// The PRD says the order value is "auto-fetched from Procurement using the Enq
// ID". There is no Procurement API in this stack; the deal tickets behind
// Django `/crm/leads/` are the only system that holds cart and order value, and
// a ticket's `id` *is* the cart/ENQ number. So the Enq ID is looked up among the
// deals already on the client's phone number.
//
// Matching is EXACT (case- and space-insensitive only). A near-miss is reported
// as no match and the rep types the figure themselves, flagged as manual —
// resolving `ENQ-2488` to `ENQ-24881` would attach one client's money to
// another's lead, and no amount of convenience is worth that.

export interface EnqLookup {
  status: 'matched' | 'no-match' | 'unavailable';
  /** Order/cart value on the matched ticket, in ₹. */
  orderValue?: number;
  dealStatus?: string;
  /** Deal assignee — PRD §3.5 "BM Name (from Procurement)". */
  bmName?: string;
  branch?: string;
  /** Enq IDs that DO exist on this phone, to help a rep spot a typo. */
  available?: string[];
  /** The whole matched ticket — the Leads tab renders its line items. */
  deal?: LeadDeal;
}

const normalizeEnq = (v: string | undefined): string =>
  String(v || '').trim().toUpperCase().replace(/\s+/g, '');

export async function lookupEnqId(phone: string | undefined, enqId: string | undefined): Promise<EnqLookup> {
  const want = normalizeEnq(enqId);
  const ph = String(phone || '').trim();
  if (!want || !ph) return { status: 'no-match' };

  // `fetchCRMLeads` directly, NOT `fetchLeadDeals` — which catches its own
  // errors into `[]`. Through that wrapper the `unavailable` branch below was
  // unreachable: a Django outage returned an empty deal list, which reads as
  // "no ticket has that Enq ID", and every rep would have been told their
  // perfectly good Enquiry ID was invalid while the backend was down. This is
  // the same one-level-up swallow the Site Audit funnel module works around,
  // and the reason `unavailable` exists as a third state at all.
  let deals: LeadDeal[];
  try {
    const { results } = await fetchCRMLeads({ q: ph, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' });
    if (!Array.isArray(results)) throw new Error('deal ticket search returned a non-array');
    deals = results.map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      status: r.status || '',
      cartValue: Number(r.cartValue) || 0,
      cartItems: r.cartItems || undefined,
      branch: r.branch || undefined,
      assignedTo: r.assignedTo || undefined,
      createdAt: r.createdAt || undefined,
      followUpDate: r.followUpDate || undefined,
      closureDate: r.closureDate || undefined,
      lostReason: r.lostReason || undefined,
    }));
  } catch (e) {
    // A Django outage is not evidence the Enq ID is wrong. Kept distinct from
    // 'no-match' so the UI never tells a rep their correct ID is invalid.
    console.error('[b2b] enq lookup failed', e);
    return { status: 'unavailable' };
  }
  const hit = deals.find((d) => normalizeEnq(d.id) === want);
  if (!hit) {
    return { status: 'no-match', available: deals.map((d) => d.id).filter(Boolean) };
  }
  return {
    status: 'matched',
    orderValue: Number(hit.cartValue) || 0,
    dealStatus: hit.status || undefined,
    bmName: hit.assignedTo || undefined,
    branch: hit.branch || undefined,
    deal: hit,
  };
}


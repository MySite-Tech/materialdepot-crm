import { LeadDeal } from '@/components/b2b/models/mock-data';
import { CRMLeadRow, fetchLeadsByEnquiryId, fetchLeadsByPhone } from '@/lib/api';

export interface EnqLookup {
  status: 'matched' | 'no-match' | 'unavailable';

  orderValue?: number;
  dealStatus?: string;

  bmName?: string;
  branch?: string;

  available?: string[];

  /** Set when the matched ticket sits on a different number from the lead's. */
  otherPhone?: string;

  deal?: LeadDeal;
}

const normalizeEnq = (v: string | undefined): string =>
  String(v || '').trim().toUpperCase().replace(/\s+/g, '');

const tenDigits = (v: string | undefined | null): string =>
  String(v || '').replace(/\D/g, '').slice(-10);

const toDeal = (r: CRMLeadRow): LeadDeal => ({
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
});

/** Resolve an Enq ID to its deal ticket.
 *
 * The id is looked up directly against the indexed enquiry-id column, so a lead
 * whose Kylas phone differs from the number on the cart still resolves — that
 * mismatch used to make every such fetch report a valid Enq ID as invalid.
 * Matching stays EXACT: `enquiry_ids=` is an `__in` lookup, never a prefix, so
 * `ENQ-2488` can never resolve to `ENQ-24881` and attach another client's money.
 * When the ticket belongs to a different number, `otherPhone` says so rather
 * than binding the value silently.
 *
 * A backend outage returns `unavailable`, kept distinct from `no-match` so the
 * UI never tells a rep their correct Enquiry ID is invalid.
 */
export async function lookupEnqId(phone: string | undefined, enqId: string | undefined): Promise<EnqLookup> {
  const want = normalizeEnq(enqId);
  if (!want) return { status: 'no-match' };

  let rows: CRMLeadRow[];
  try {
    rows = await fetchLeadsByEnquiryId(want);
  } catch (e) {
    console.error('[b2b] enq lookup failed', e);
    return { status: 'unavailable' };
  }

  const hit = rows.find((r) => normalizeEnq(r.id) === want);
  if (!hit) return { status: 'no-match', available: await enqIdsOn(phone) };

  const leadPhone = tenDigits(phone);
  const dealPhone = tenDigits(hit.clientPhone);
  return {
    status: 'matched',
    orderValue: Number(hit.cartValue) || 0,
    dealStatus: hit.status || undefined,
    bmName: hit.assignedTo || undefined,
    branch: hit.branch || undefined,
    otherPhone: leadPhone && dealPhone && leadPhone !== dealPhone ? hit.clientPhone || undefined : undefined,
    deal: toDeal(hit),
  };
}

/** The Enq IDs that do exist on this lead's number, for the "did you mean" chips.
 *
 * Only reached on a miss, and `fetchLeadsByPhone` memoises per phone — the
 * drawer has already loaded this list to render its deal tickets, so in practice
 * this costs no extra request. A failure here must not turn a real `no-match`
 * into an error, so it degrades to no suggestions.
 */
async function enqIdsOn(phone: string | undefined): Promise<string[] | undefined> {
  const ph = String(phone || '').trim();
  if (!ph) return undefined;
  try {
    const rows = await fetchLeadsByPhone(ph);
    if (!Array.isArray(rows)) return undefined;
    return rows.map((r) => r.id).filter(Boolean);
  } catch {
    return undefined;
  }
}

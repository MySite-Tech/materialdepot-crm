import { fetchOutreachLeads } from './reads';
import { fetchInboundBoard } from './reads';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mockData';
// ── Leads tab: one row per lead, across both source modules ──────────────────
//
// Implements `Leads_Tab_PRD.docx` v1.0 (KK, Business Head – B2B). The tab
// captures nothing itself: every row originates in Inbound or Outreach, and the
// Enquiry ID / order value / line items come from the deal tickets, exactly as
// both source modules already fetch them.
//
// Three shape decisions the PRD leaves open, resolved here rather than in JSX:
//
//   Status is binary — Closed / Yet to Close, as written. Lost leads are NOT
//   dropped (open question #1): dropping them hides the outcome the business
//   most wants to count, and folding them into "Yet to Close" would claim a
//   dead lead is still being worked. They render as Yet to Close carrying an
//   explicit Lost mark, and the tab can filter on it.
//
//   Expected date of closure exists for Outreach and does NOT exist for
//   Inbound — the Kylas `expectedClosureOn` field is auto-stamped junk and is
//   deliberately unmapped (see the Inbound notes). So the column reports three
//   states, not two: a date, "not set", or "n/a for this source". Collapsing
//   the third into the second would read as the Inbound team failing to fill a
//   field that does not exist.
//
//   Company name is `undefined`, not a placeholder, when the source has none —
//   Kylas ships the phone number in the name field on most inbound leads, and
//   `LeadName` is what decides how that renders.

export type LeadSource = 'Inbound' | 'Outreach';
export type UnifiedStatus = 'Closed' | 'Yet to Close';

export interface UnifiedLead {
  /** Unique across pipelines — a Kylas id and a b2b_lead uuid can't collide, but this makes it impossible. */
  key: string;
  id: string;
  source: LeadSource;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  gstNumber?: string;
  enqId?: string;
  orderValue?: number;
  /** Undefined means the SOURCE MODULE HAS NO SUCH FIELD — see the note above. */
  expectedClosure?: string;
  hasExpectedClosureField: boolean;
  kam?: string;
  spok?: string;
  status: UnifiedStatus;
  /** True when the source module marked it Lost. Renders beside the binary status. */
  lost: boolean;
  /** The source module's own status, shown in the detail view. */
  sourceStatus: string;
  /** The originating record, for "Source Lead Details". Exactly one is set. */
  inbound?: InboundLead;
  outreach?: OutreachLead;
}

function inboundToUnified(l: InboundLead): UnifiedLead {
  return {
    key: `inbound:${l.id}`,
    id: l.id,
    source: 'Inbound',
    // A Kylas "name" that is only the phone number is not a company name.
    companyName: String(l.companyName || '').trim() || undefined,
    contactPerson: l.contactName || undefined,
    phone: l.phone || undefined,
    gstNumber: l.gstNumber || undefined,
    enqId: l.enqId || undefined,
    orderValue: l.orderValue || undefined,
    expectedClosure: undefined,
    hasExpectedClosureField: false,
    kam: l.kam || undefined,
    // PRD "Spok — whoever is/was speaking to the lead". §3.5 records it
    // explicitly on close; before that the assigned BM is the person on it.
    spok: l.placedUnder?.spok || l.owner || undefined,
    status: l.stage === 'Closed' ? 'Closed' : 'Yet to Close',
    lost: l.stage === 'Lost',
    sourceStatus: l.stage,
    inbound: l,
  };
}

function outreachToUnified(l: OutreachLead): UnifiedLead {
  return {
    key: `outreach:${l.id}`,
    id: l.id,
    source: 'Outreach',
    companyName: String(l.company || '').trim() || undefined,
    contactPerson: l.contactPerson || undefined,
    phone: l.phone || undefined,
    gstNumber: l.gstNumber || undefined,
    enqId: l.enqId || undefined,
    orderValue: l.orderValue || undefined,
    expectedClosure: l.expectedClosure || undefined,
    hasExpectedClosureField: true,
    kam: l.kam || undefined,
    spok: l.spok || l.bm || undefined,
    status: l.status === 'Closed' ? 'Closed' : 'Yet to Close',
    lost: l.status === 'Lost',
    sourceStatus: l.status,
    outreach: l,
  };
}

export interface UnifiedLeadsResult {
  leads: UnifiedLead[];
  /** True Kylas total of unactioned inbound leads; the board only loads page 0. */
  inboundTotal: number;
  inboundHasMore: boolean;
  /** Which sides failed, so the tab can say "partial" instead of showing a short list as complete. */
  failed: LeadSource[];
}

/**
 * Every lead in the B2B CRM, from both source modules.
 *
 * Each side is reported separately on failure rather than folded into an empty
 * list: a Leads tab that quietly shows only the Outreach half looks exactly
 * like a CRM in which nobody has any inbound leads.
 */
export async function fetchUnifiedLeads(opts?: {
  createdFrom?: string;
  createdTo?: string;
}): Promise<UnifiedLeadsResult> {
  const failed: LeadSource[] = [];

  const inboundP = fetchInboundBoard({ page: 0, createdFrom: opts?.createdFrom, createdTo: opts?.createdTo })
    .catch((e) => {
      console.error('[b2b] leads tab: inbound fetch failed', e);
      failed.push('Inbound');
      return { leads: [] as InboundLead[], page: 0, hasMore: false, total: 0 };
    });
  const outreachP = fetchOutreachLeads({ createdFrom: opts?.createdFrom, createdTo: opts?.createdTo })
    .catch((e) => {
      console.error('[b2b] leads tab: outreach fetch failed', e);
      failed.push('Outreach');
      return [] as OutreachLead[];
    });

  const [inbound, outreach] = await Promise.all([inboundP, outreachP]);

  return {
    leads: [
      ...inbound.leads.map(inboundToUnified),
      ...outreach.map(outreachToUnified),
    ],
    inboundTotal: inbound.total,
    inboundHasMore: inbound.hasMore,
    failed,
  };
}

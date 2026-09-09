import { B2BLeadRow, MetaSpec, arr, num, str } from './rows';
import { LeadType, Segment, type Selection } from '@/components/b2b/models/inboundModel';
import { LeadNote, OutreachLead } from '@/components/b2b/models/mockData';
import { CompanyType, OutreachMeeting, normalizeOutreachStatus } from '@/components/b2b/models/outreachModel';
// ── Outreach: one field table, both directions ───────────────────────────────
//
// `OUTREACH_META` is the single declaration the reader and the writer share, so
// a field cannot exist on one side only. That asymmetry is not hypothetical
// here: the previous `rowToOutbound` read `m.expected_closure` while
// `outboundToRow` never wrote it, so an Expected date of closure typed into the
// drawer was silently dropped on every save — and it is a column the Leads tab
// PRD asks for.

export const OUTREACH_META: MetaSpec<OutreachLead> = {
  company:            { col: 'company',          read: (v) => String(v ?? '') },
  contactPerson:      { col: 'contact_person',   read: (v) => String(v ?? '') },
  designation:        { col: 'designation',      read: str },
  phone:              { col: 'phone',            read: str },
  gstNumber:          { col: 'gst_number',       read: str },
  segment:            { col: 'segment',          read: (v) => str(v) as Segment | undefined },
  leadType:           { col: 'lead_type',        read: (v) => str(v) as LeadType | undefined },
  companyType:        { col: 'company_type',     read: (v) => str(v) as CompanyType | undefined },
  companyTypeOther:   { col: 'company_type_other', read: str },
  createdAt:          { col: 'created_at',       read: str },
  meetings:           { col: 'meetings',         read: (v) => arr<OutreachMeeting>(v) },
  selections:         { col: 'selections',       read: (v) => arr<Selection>(v) },
  requirement:        { col: 'requirement',      read: str },
  expectedOrderValue: { col: 'expected_order_value', read: num },
  statusChangedAt:    { col: 'status_changed_at', read: str },
  followUpDate:       { col: 'follow_up_date',   read: str },
  followUpTime:       { col: 'follow_up_time',   read: str },
  quoteSharedAt:      { col: 'quote_shared_at',  read: str },
  enqId:              { col: 'enq_id',           read: str },
  orderValue:         { col: 'order_value',      read: num },
  orderValueSource:   { col: 'order_value_source', read: (v) => (v === 'deal' || v === 'manual' ? v : undefined) },
  dealStatus:         { col: 'deal_status',      read: str },
  expectedClosure:    { col: 'expected_closure', read: str },
  lostReason:         { col: 'lost_reason',      read: str },
  kam:                { col: 'kam',              read: str },
  spok:               { col: 'spok',             read: str },
  ecName:             { col: 'ec_name',          read: str },
  ecBmName:           { col: 'ec_bm_name',       read: str },
  notes:              { col: 'notes',            read: (v) => arr<LeadNote>(v) },
};

export function rowToOutreach(r: B2BLeadRow): OutreachLead {
  const m = r.meta_data || {};
  const lead = { id: r.id, bm: r.owner } as OutreachLead;
  for (const [key, spec] of Object.entries(OUTREACH_META) as [keyof OutreachLead, { col: string; read: (v: any) => any }][]) {
    (lead as unknown as Record<string, unknown>)[key] = spec.read(m[spec.col]);
  }
  // Legacy stage strings are decomposed on READ, so a row written by an older
  // bundle still lands in a real column. See `normalizeOutreachStatus`.
  lead.status = normalizeOutreachStatus(r.stage);
  // Realised rupees only. `r.value` is the stored column analytics sums; an
  // order value fetched from a deal ticket is the only thing allowed into it.
  lead.value = Number(lead.orderValue) || 0;
  return lead;
}

export function outreachToRow(l: OutreachLead): B2BLeadRow {
  const meta: Record<string, any> = {};
  for (const [key, spec] of Object.entries(OUTREACH_META) as [keyof OutreachLead, { col: string }][]) {
    const v = l[key];
    meta[spec.col] = v === undefined ? null : v;
  }
  return {
    id: l.id,
    // The stored pipeline value stays 'outbound' — see the note in mockData.ts.
    pipeline: 'outbound',
    stage: l.status,
    kylas_lead_id: null,
    owner: l.bm,
    // Realised rupees only, mirroring `value` on the UI type. A BM's estimate
    // lives in meta_data.expected_order_value and is never promoted into this
    // column, which is the one `analytics.ts` sums as revenue.
    value: Number(l.orderValue) || 0,
    meta_data: meta,
  };
}


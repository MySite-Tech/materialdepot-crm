import { B2BLeadRow, MetaSpec, arr, num, str } from '../data/rows';
import { LeadType, Segment, type Selection } from '@/components/b2b/models/inbound';
import { LeadNote, OutreachLead } from '@/components/b2b/models/mock-data';
import {
  CompanyType, JourneyEvent, OUTREACH_SOURCES, OutreachContact, OutreachHandover, OutreachIntake, OutreachMeeting, OutreachSource,
  TEAM_SIZES, TeamSize, normalizeOutreachStatus,
} from '@/components/b2b/models/outreach';

const obj = <T,>(v: any): T | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : undefined);
const oneOf = <T extends string>(list: readonly T[]) => (v: any): T | undefined =>
  (list as readonly string[]).includes(String(v)) ? (v as T) : undefined;

const OUTREACH_META: MetaSpec<OutreachLead> = {
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
  bmPhone:            { col: 'bm_phone',         read: str },
  altPhone:           { col: 'alt_phone',        read: str },
  contacts:           { col: 'contacts',         read: (v) => arr<OutreachContact>(v) },
  source:             { col: 'source',           read: (v) => oneOf<OutreachSource>(OUTREACH_SOURCES)(v) },
  email:              { col: 'email',            read: str },
  city:               { col: 'city',             read: str },
  officeAddress:      { col: 'office_address',   read: str },
  teamSize:           { col: 'team_size',        read: (v) => oneOf<TeamSize>(TEAM_SIZES)(v) },
  whatsappGroupLink:  { col: 'whatsapp_group_link', read: str },
  convertedAt:        { col: 'converted_at',     read: str },
  newOnboarding:      { col: 'new_onboarding',   read: (v) => (typeof v === 'boolean' ? v : undefined) },
  intake:             { col: 'intake',           read: (v) => obj<OutreachIntake>(v) },
  handover:           { col: 'handover',         read: (v) => obj<OutreachHandover>(v) },
  journey:            { col: 'journey',          read: (v) => arr<JourneyEvent>(v) },
};

export function rowToOutreach(r: B2BLeadRow): OutreachLead {
  const m = r.meta_data || {};
  const lead = { id: r.id, bm: r.owner } as OutreachLead;
  for (const [key, spec] of Object.entries(OUTREACH_META) as [keyof OutreachLead, { col: string; read: (v: any) => any }][]) {
    (lead as unknown as Record<string, unknown>)[key] = spec.read(m[spec.col]);
  }

  lead.status = normalizeOutreachStatus(r.stage);

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

    pipeline: 'outbound',
    stage: l.status,
    kylas_lead_id: null,
    owner: l.bm,

    value: Number(l.orderValue) || 0,
    meta_data: meta,
  };
}


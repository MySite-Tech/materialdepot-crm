import { supabase } from '@/lib/supabase';
import {
  fetchB2BInboundLeads, B2B_INBOUND_OWNER_LIST, fetchCRMLeadsStats,
  fetchClientOrderHistoriesApi, fetchLeadDeals,
  type CRMLeadsStats, type CRMLeadsStatsBucket, type ClientOrderHistoryRow,
} from '@/lib/mockApi';
import {
  defaultTargetStore,
  type InboundLead, type InboundStage,
  type OutreachLead,
  type KamClient, type KamStage, type KamSource,
  type AccountType, type ProductCategory, type LeadNote, type LeadDeal,
  type TargetStore,
} from '@/components/b2b/mockData';
import type { Escalation } from '@/components/b2b/accountHealth';
import {
  normalizeStatus, decomposeLegacyStage, locationFromPincode, clientTypeFromKylas,
  type InboundStatus, type CallAttempt, type Segment, type LeadType, type Selection,
} from '@/components/b2b/inboundModel';
import {
  normalizeOutreachStatus,
  type OutreachStatus, type OutreachMeeting, type CompanyType,
} from '@/components/b2b/outreachModel';

type Pipeline = 'inbound' | 'outbound' | 'kam';

interface B2BLeadRow {
  id: string;
  pipeline: Pipeline;
  stage: string;
  kylas_lead_id: string | null;
  owner: string;
  value: number;
  meta_data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'b2b_lead';

// Fresh-start floor. The B2B board was reset on this date: every b2b_lead row
// created before it was deleted, and Kylas — which still holds years of older
// inbound leads — must never surface them again. Every inbound read is clamped
// to this day, so a cleared or widened date filter cannot reach behind it.
export const B2B_FRESH_START = '2026-08-26';

// The later of `day` and the fresh-start floor. Empty/invalid input yields the
// floor itself, so "no filter" still means "from the reset onwards".
function floorToFreshStart(day?: string): string {
  return day && day > B2B_FRESH_START ? day : B2B_FRESH_START;
}

// ── Mappers: row ↔ UI type ───────────────────────────────────────────────────

// ── Inbound: one field table, both directions ────────────────────────────────
//
// `meta_data` is untyped jsonb, and it used to be read by one hand-written
// object literal and written by another. Anything present in only one of them
// was silently dropped on every save — which is what happened to `calls` and
// `notes`, hardcoded to `[]` on read while the writer never sent them at all.
//
// One table now drives both directions, so a new PRD field is a single line and
// cannot round-trip lossily. Kylas-owned fields (§3.1) are deliberately absent:
// they are re-read from Kylas on every sync and mirroring them here would let a
// stale snapshot win over Presales.
type MetaKind = 'string' | 'number' | 'array' | 'object';

interface MetaField {
  ui: keyof InboundLead;
  db: string;
  kind: MetaKind;
}

const INBOUND_META: MetaField[] = [
  // §3.2 — the Inbound team's own fields
  { ui: 'companyName',        db: 'company_name',         kind: 'string' },
  { ui: 'gstNumber',          db: 'gst_number',           kind: 'string' },
  { ui: 'segment',            db: 'segment',              kind: 'string' },
  { ui: 'clientType',         db: 'client_type',          kind: 'string' },
  { ui: 'leadType',           db: 'lead_type',            kind: 'string' },
  { ui: 'priority',           db: 'priority',             kind: 'string' },
  { ui: 'location',           db: 'location',             kind: 'string' },
  { ui: 'callAttempts',       db: 'call_attempts',        kind: 'array'  },
  // §3.3 — requirement
  { ui: 'selections',         db: 'selections',           kind: 'array'  },
  { ui: 'requirement',        db: 'requirement',          kind: 'string' },
  { ui: 'expectedOrderValue', db: 'expected_order_value', kind: 'number' },
  // §3.4 — status working fields
  { ui: 'followUpDate',       db: 'follow_up_date',       kind: 'string' },
  { ui: 'followUpTime',       db: 'follow_up_time',       kind: 'string' },
  { ui: 'enqId',              db: 'enq_id',               kind: 'string' },
  { ui: 'orderValue',         db: 'order_value',          kind: 'number' },
  { ui: 'orderValueSource',   db: 'order_value_source',   kind: 'string' },
  { ui: 'lostReason',         db: 'lost_reason',          kind: 'string' },
  { ui: 'statusChangedAt',    db: 'status_changed_at',    kind: 'string' },
  // §3.5 — placed under / KAM handoff
  { ui: 'placedUnder',        db: 'placed_under',         kind: 'object' },
  { ui: 'kam',                db: 'kam',                  kind: 'string' },
  // Notes are CRM-local. Kylas notes are fetched separately and merged for
  // display; only notes typed here are stored here.
  { ui: 'notes',              db: 'notes',                kind: 'array'  },
];

// Snapshot of the Kylas half. Written so a card still renders (and the list view
// still filters) when Kylas is unreachable, but always overwritten by a live
// Kylas read — never authoritative. See `mergeKylasIntoRow`.
const INBOUND_KYLAS_SNAPSHOT: MetaField[] = [
  { ui: 'company',            db: 'company',              kind: 'string' },
  { ui: 'phone',              db: 'phone',                kind: 'string' },
  { ui: 'contactName',        db: 'contact_name',         kind: 'string' },
  { ui: 'ownerId',            db: 'owner_kylas_id',       kind: 'number' },
  { ui: 'kylasStage',         db: 'kylas_stage',          kind: 'number' },
  { ui: 'source',             db: 'source',               kind: 'string' },
  { ui: 'leadCreatedAt',      db: 'lead_created_at',      kind: 'string' },
  { ui: 'qualificationTag',   db: 'qualification_tag',    kind: 'string' },
  { ui: 'presalesOwner',      db: 'presales_owner',       kind: 'string' },
  { ui: 'leadSummary',        db: 'lead_summary',         kind: 'string' },
  { ui: 'urgency',            db: 'urgency',              kind: 'string' },
  { ui: 'pincode',            db: 'pincode',              kind: 'string' },
  { ui: 'presalesClientType', db: 'presales_client_type', kind: 'string' },
  { ui: 'presalesMissedCalls', db: 'presales_missed_calls', kind: 'number' },
];

const ALL_INBOUND_META = [...INBOUND_META, ...INBOUND_KYLAS_SNAPSHOT];

// The previous mapper wrote its own display fallbacks into the database:
// `contact_name` is the literal em-dash placeholder on 150 of the 151 live rows
// because `mapInboundLead` used `firstName || '—'` and the writer stored
// whatever it was handed. Read as empty, so "Presales gave no contact name"
// doesn't render as a name that happens to be a dash — and so a real name
// entered later isn't compared against one.
const PERSISTED_PLACEHOLDERS = new Set(['—', '-', 'undefined', 'null', 'NaN']);

function readMeta(m: Record<string, any>, f: MetaField): unknown {
  const v = m[f.db];
  if (typeof v === 'string' && PERSISTED_PLACEHOLDERS.has(v.trim())) return undefined;
  switch (f.kind) {
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) && v !== '' && v !== null ? n : undefined;
    }
    case 'array':  return Array.isArray(v) ? v : undefined;
    case 'object': return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
    default:       return v === '' || v === null || v === undefined ? undefined : String(v);
  }
}

function writeMeta(l: InboundLead, f: MetaField): unknown {
  const v = l[f.ui];
  switch (f.kind) {
    case 'number': return Number(v) || 0;
    case 'array':  return Array.isArray(v) ? v : [];
    case 'object': return v && typeof v === 'object' ? v : {};
    default: {
      const s = v == null ? '' : String(v);
      return PERSISTED_PLACEHOLDERS.has(s.trim()) ? '' : s;
    }
  }
}

/**
 * Card headline. The Inbound team's company name wins; otherwise the Kylas name,
 * which on these leads is usually the phone number repeated — hence the PRD
 * making Client Company Name the team's first job.
 */
function inboundDisplayName(l: Partial<InboundLead>): string {
  const own = String(l.companyName || '').trim();
  if (own) return own;
  const kylas = String(l.company || '').trim();
  if (kylas) return kylas;
  return String(l.contactName || '').trim() || String(l.phone || '').trim() || 'Unnamed lead';
}

function rowToInbound(r: B2BLeadRow): InboundLead {
  const m = r.meta_data || {};
  const lead: Record<string, unknown> = {};
  for (const f of ALL_INBOUND_META) {
    const v = readMeta(m, f);
    if (v !== undefined) lead[f.ui as string] = v;
  }

  // A legacy stage carries more than a status: `Hyderabad` was a location and
  // `Enquiry Invalid` a lost reason. Decompose rather than discard, and never
  // overwrite a value the team has since set explicitly.
  const status: InboundStatus = normalizeStatus(r.stage);
  const legacy = decomposeLegacyStage(r.stage);
  if (legacy.location && !lead.location) lead.location = legacy.location;
  if (legacy.lostReason && !lead.lostReason) lead.lostReason = legacy.lostReason;
  if (legacy.rnr && !(lead.callAttempts as CallAttempt[] | undefined)?.length) {
    // The old `RNR` column recorded that the last call rang out but not when.
    // Seeded as attempt 1 with the row's own date so the attempt tracker starts
    // from what is known instead of claiming zero calls were ever made.
    lead.callAttempts = [{
      n: 1, outcome: 'RNR',
      at: r.updated_at || `${r.created_at || ''}T00:00:00Z`,
      note: 'Carried over from the retired RNR column',
    } satisfies CallAttempt];
  }
  if (!lead.location) lead.location = locationFromPincode(lead.pincode as string | undefined);
  if (!lead.clientType) lead.clientType = clientTypeFromKylas(lead.presalesClientType as string | undefined);

  const out = {
    ...lead,
    id: r.kylas_lead_id || r.id,
    owner: r.owner || '',
    stage: status,
    // `value` is realised revenue for `analytics.ts`. The column is the stored
    // order value; the BM's estimate lives in `expectedOrderValue` and is never
    // folded in here.
    value: Number(r.value) || 0,
    phone: (lead.phone as string) || '',
    contactName: (lead.contactName as string) || '',
    source: (lead.source as InboundLead['source']) || 'Other',
    calls: [],
  } as unknown as InboundLead;
  out.company = inboundDisplayName(out);
  // Retained aliases the shared boards read.
  out.timeline = out.urgency;
  out.requirementBrief = out.leadSummary;
  return out;
}

function inboundToRow(l: InboundLead): B2BLeadRow {
  const meta: Record<string, unknown> = {};
  for (const f of ALL_INBOUND_META) meta[f.db] = writeMeta(l, f);
  return {
    id: l.id,
    pipeline: 'inbound',
    stage: l.stage,
    kylas_lead_id: l.id,
    owner: l.owner,
    // Realised order value only — see the note on `InboundLead.value`.
    value: Number(l.orderValue) || 0,
    meta_data: meta,
  };
}

/**
 * A promoted row overlaid with a live Kylas read.
 *
 * Kylas owns §3.1 outright, so its values replace the stored snapshot on every
 * sync — otherwise a reassigned lead would keep showing the old BM forever. The
 * CRM half of the row is untouched.
 */
function mergeKylasIntoRow(dbLead: InboundLead, kylas: InboundLead): InboundLead {
  const merged: InboundLead = {
    ...dbLead,
    phone: kylas.phone || dbLead.phone,
    contactName: kylas.contactName || dbLead.contactName,
    owner: kylas.owner || dbLead.owner,
    ownerId: kylas.ownerId ?? dbLead.ownerId,
    leadCreatedAt: kylas.leadCreatedAt || dbLead.leadCreatedAt,
    qualificationTag: kylas.qualificationTag || dbLead.qualificationTag,
    presalesOwner: kylas.presalesOwner || dbLead.presalesOwner,
    leadSummary: kylas.leadSummary || dbLead.leadSummary,
    urgency: kylas.urgency || dbLead.urgency,
    pincode: kylas.pincode || dbLead.pincode,
    presalesClientType: kylas.presalesClientType || dbLead.presalesClientType,
    presalesMissedCalls: kylas.presalesMissedCalls ?? dbLead.presalesMissedCalls,
    kylasStage: kylas.kylasStage ?? dbLead.kylasStage,
    source: kylas.source || dbLead.source,
    // Requirement is shared (§3.3, pushed back to Kylas). A CRM edit that has
    // not been pushed yet must not be clobbered by the pre-edit Kylas value, so
    // the local one wins when it has content.
    requirement: dbLead.requirement || kylas.requirement,
  };
  if (!merged.location) merged.location = locationFromPincode(merged.pincode);
  if (!merged.clientType) merged.clientType = clientTypeFromKylas(merged.presalesClientType);
  merged.company = inboundDisplayName(merged);
  merged.timeline = merged.urgency;
  merged.requirementBrief = merged.leadSummary;
  return merged;
}

// ── Outreach: one field table, both directions ───────────────────────────────
//
// `OUTREACH_META` is the single declaration the reader and the writer share, so
// a field cannot exist on one side only. That asymmetry is not hypothetical
// here: the previous `rowToOutbound` read `m.expected_closure` while
// `outboundToRow` never wrote it, so an Expected date of closure typed into the
// drawer was silently dropped on every save — and it is a column the Leads tab
// PRD asks for.

type MetaSpec<T> = {
  [K in keyof T]?: {
    /** meta_data key. */
    col: string;
    read: (v: any) => T[K];
  };
};

const str = (v: any): string | undefined => {
  const s = String(v ?? '').trim();
  return s || undefined;
};
const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
const arr = <T,>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : []);

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
};

function rowToOutreach(r: B2BLeadRow): OutreachLead {
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

function outreachToRow(l: OutreachLead): B2BLeadRow {
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

function rowToKam(r: B2BLeadRow): KamClient {
  const m = r.meta_data || {};
  return {
    id: r.id,
    company: m.company || '',
    contactName: m.contact_name || '',
    phone: m.phone || '',
    enqId: m.enq_id || undefined,
    value: Number(r.value) || 0,
    expectedClosure: m.expected_closure || undefined,
    stage: r.stage as KamStage,
    kam: r.owner,
    source: (m.source as KamSource) || 'Existing',
    notes: (m.notes as LeadNote[]) || [],
    escalations: (m.escalations as Escalation[]) || [],
  };
}

function kamToRow(l: KamClient): B2BLeadRow {
  return {
    id: l.id,
    pipeline: 'kam',
    stage: l.stage,
    kylas_lead_id: null,
    owner: l.kam,
    value: l.value || 0,
    meta_data: {
      company: l.company,
      contact_name: l.contactName,
      phone: l.phone,
      enq_id: l.enqId || '',
      source: l.source,
      expected_closure: l.expectedClosure || '',
      notes: l.notes || [],
      escalations: l.escalations || [],
    },
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

// 'YYYY-MM-DD' + 1 day, as a string. Used to build a half-open upper bound.
function nextDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + 86_400_000).toISOString().slice(0, 10);
}

// createdFrom/createdTo are 'YYYY-MM-DD', both inclusive.
//
// created_at is a *text* column, so these are lexicographic comparisons — which
// match chronological order for ISO-8601-shaped strings. The range is half-open
// (`>= from`, `< to+1day`) rather than `<= to` so it is correct whether a value
// is day-only ('2026-08-06') or a full timestamp ('2026-08-06T18:00:00Z'):
// both sort below '2026-08-07'. A `<= '2026-08-06'` bound would drop the
// timestamped one, and a `<= '2026-08-06T23:59:59'` bound would drop the
// day-only one (a string sorts before its own longer extension).
async function fetchRows(
  pipeline: Pipeline,
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<B2BLeadRow[]> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('pipeline', pipeline);
  if (opts?.createdFrom) query = query.gte('created_at', opts.createdFrom);
  if (opts?.createdTo) query = query.lt('created_at', nextDay(opts.createdTo));
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as B2BLeadRow[];
}

export interface InboundBoardPage {
  leads: InboundLead[];
  page: number;
  hasMore: boolean;
  total: number;
}

// Inbound board = promoted DB rows + Kylas "New" leads not yet in the DB.
// Paginated over the Kylas side; DB overlay is loaded once on the first page.
// createdFrom/createdTo are plain 'YYYY-MM-DD' days. The IST-anchored instants
// Kylas needs are derived here, so the two sides can't drift apart.
export async function fetchInboundBoard(
  opts?: {
    page?: number; ownerId?: number; search?: string;
    createdFrom?: string; createdTo?: string; kylasStage?: number;
  },
): Promise<InboundBoardPage> {
  const page = opts?.page ?? 0;
  const ownerIds = opts?.ownerId ? [opts.ownerId] : undefined;
  const search = (opts?.search || '').trim();
  const createdFrom = floorToFreshStart(opts?.createdFrom);
  const createdAfter = new Date(`${createdFrom}T00:00:00+05:30`).toISOString();
  const createdBefore = opts?.createdTo ? new Date(`${opts.createdTo}T23:59:59.999+05:30`).toISOString() : '';
  const kylas = await fetchB2BInboundLeads(
    page, ownerIds, search, createdAfter, createdBefore, opts?.kylasStage,
  );

  // A New-stage filter is about the Kylas New pool only, so the DB overlay is
  // skipped entirely.
  let dbLeads: InboundLead[] = [];
  if (page === 0 && !opts?.kylasStage) {
    try {
      // Same created-date window Kylas applied to the New pool, so promoted
      // leads in the other columns honour the filter too. Applied in SQL against
      // the created_at column rather than a mapped field, so it doesn't depend on
      // the row mapper carrying a date through.
      const rows = await fetchRows('inbound', {
        createdFrom,
        createdTo: opts?.createdTo,
      });
      dbLeads = rows.map(rowToInbound);
      if (opts?.ownerId) dbLeads = dbLeads.filter((l) => l.ownerId === opts.ownerId);
      if (search) {
        const q = search.toLowerCase();
        dbLeads = dbLeads.filter((l) =>
          [l.company, l.companyName, l.contactName, l.phone].some((v) => (v || '').toLowerCase().includes(q)),
        );
      }
    } catch (e) {
      console.error('[b2b] inbound DB fetch failed (pre-migration?)', e);
    }
  }
  // Refresh the Kylas half of every promoted row that this page also returned.
  // Without this a lead keeps rendering the §3.1 snapshot taken when it was
  // first dragged out of New — so a reassignment in Kylas, or a name Presales
  // corrected, never reaches the board.
  const kylasById = new Map(kylas.leads.map((k) => [k.id, k]));
  dbLeads = dbLeads.map((l) => {
    const fresh = kylasById.get(l.id);
    return fresh ? mergeKylasIntoRow(l, fresh) : l;
  });

  const kylasIds = new Set(kylas.leads.map((k) => k.id));
  dbLeads = dbLeads.filter((l) => l.stage !== 'New' || kylasIds.has(l.id));

  const dbIds = new Set(dbLeads.map((l) => l.id));
  return {
    leads: [...dbLeads, ...kylas.leads.filter((k) => !dbIds.has(k.id))],
    page: kylas.page,
    hasMore: kylas.hasMore,
    total: kylas.total,
  };
}

export interface B2BData {
  inbound: InboundLead[];
  outreach: OutreachLead[];
  kam: KamClient[];
  inboundTotal: number;                        // true Kylas total of "New" inbound leads (board only loads page 0)
  inboundOwnerTotals: Record<string, number>;  // New-stage count per owner name (for the leaderboard)
}

// Per-owner New-stage totals from Kylas (one light count query per inbound owner).
async function fetchInboundOwnerTotals(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    B2B_INBOUND_OWNER_LIST.map(async (o) => {
      try {
        const res = await fetchB2BInboundLeads(
          0, [o.id], '', new Date(`${B2B_FRESH_START}T00:00:00+05:30`).toISOString(),
        );
        return [o.name, res.total] as const;
      } catch {
        return [o.name, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// Aggregation feed for Dashboard / Leadership / Targets — one pull across all
// three pipelines. Inbound = full DB overlay + first page of Kylas "New" leads;
// inboundTotal / inboundOwnerTotals carry the real New-stage counts so the
// numbers don't reflect only page 0.
export async function fetchB2BData(): Promise<B2BData> {
  const inboundP = fetchInboundBoard()
    .then((p) => ({ leads: p.leads, total: p.total }))
    .catch((e) => { console.error('[b2b] inbound aggregate fetch failed', e); return { leads: [] as InboundLead[], total: 0 }; });
  const ownerTotalsP = fetchInboundOwnerTotals().catch(() => ({} as Record<string, number>));
  const outreachP = fetchOutreachLeads()
    .catch((e) => { console.error('[b2b] outreach aggregate fetch failed', e); return [] as OutreachLead[]; });
  const [inbound, outreach, kam, inboundOwnerTotals] = await Promise.all([
    inboundP, outreachP, fetchKamClients(), ownerTotalsP,
  ]);
  return { inbound: inbound.leads, outreach, kam, inboundTotal: inbound.total, inboundOwnerTotals };
}

// ── Pipeline value (Django /crm/leads/stats/, branch = B2B) ───────────────────
// Cart value lives on the Django estimates/tickets, not in b2b_lead — so every
// rupee on the dashboard comes from the same endpoint the Leads tab strip uses,
// scoped to the B2B branch. b2b_lead only drives stage counts and ownership.

export const B2B_BRANCH = 'B2B';

export interface B2BPipelineStats {
  total: CRMLeadsStatsBucket;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
  lost: CRMLeadsStatsBucket;
  byStatus: CRMLeadsStats['byStatus'];
}

const EMPTY_BUCKET: CRMLeadsStatsBucket = { count: 0, value: 0 };

// 'YYYY-MM-DD' for the current Indian day — the API filters on IST dates.
export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Created-date window, both ends inclusive and optional. Omit both for all-time.
// Same parameters the Leads tab sends, so a B2B-filtered Leads tab and this
// dashboard report identical numbers for identical windows.
export async function fetchB2BPipelineStats(
  range?: { from?: string; to?: string },
): Promise<B2BPipelineStats> {
  const stats = await fetchCRMLeadsStats({
    branch: B2B_BRANCH, createdFrom: range?.from, createdTo: range?.to,
  }).catch((e) => { console.error('[b2b] leads stats fetch failed', e); return null; });
  return {
    total: stats?.total ?? EMPTY_BUCKET,
    active: stats?.active ?? EMPTY_BUCKET,
    won: stats?.won ?? EMPTY_BUCKET,
    lost: stats?.lost ?? EMPTY_BUCKET,
    byStatus: stats?.byStatus ?? [],
  };
}

// ── Client order history (lifetime, from Django deal tickets) ─────────────────
// One batched request for the whole board via /crm/leads/client-order-history/.
// That endpoint groups deal tickets by client in two indexed queries and reuses
// the same status/value derivation as /crm/leads/stats/, so a KAM card can never
// disagree with the Leads tab for the same client.

export interface ClientOrderHistory {
  orders: number;         // won deal count, all time
  lifetimeValue: number;  // won deal value, all time
  openValue: number;      // still-active pipeline for this client
  enquiries: number;      // every deal ever raised, won or not
  enquiryValue: number;   // value of every deal ever raised
  furthestStatus: string | null;  // furthest-progressed deal status, drives auto-advance
}

// Last 10 digits, so '+91 99000 99013' and '9900099013' resolve to one client.
export function normalizeClientPhone(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

// Module-level, so re-entering the tab doesn't refetch what we already have.
const orderHistoryCache = new Map<string, ClientOrderHistory>();

// The backend caps a request at 300 phones; chunk so a large board still works.
const HISTORY_BATCH = 300;

export async function fetchClientOrderHistories(
  phones: (string | undefined)[],
): Promise<Record<string, ClientOrderHistory>> {
  const wanted = [...new Set(phones.map(normalizeClientPhone).filter((k) => k.length === 10))];
  const out: Record<string, ClientOrderHistory> = {};
  const missing: string[] = [];
  for (const key of wanted) {
    const cached = orderHistoryCache.get(key);
    if (cached) out[key] = cached; else missing.push(key);
  }
  if (!missing.length) return out;

  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += HISTORY_BATCH) batches.push(missing.slice(i, i + HISTORY_BATCH));

  const settled = await Promise.all(
    batches.map((batch) =>
      fetchClientOrderHistoriesApi(batch).catch((e) => {
        console.error('[b2b] client order history fetch failed', e);
        return {} as Record<string, ClientOrderHistoryRow>;
      }),
    ),
  );

  for (const batch of settled) {
    for (const [key, row] of Object.entries(batch)) {
      const history: ClientOrderHistory = {
        orders: Number(row.orders) || 0,
        lifetimeValue: Number(row.lifetimeValue) || 0,
        openValue: Number(row.openValue) || 0,
        enquiries: Number(row.enquiries) || 0,
        enquiryValue: Number(row.enquiryValue) || 0,
        furthestStatus: row.furthestStatus ?? null,
      };
      // Key on the normalized phone, not the backend's raw contact string.
      const normalized = normalizeClientPhone(key);
      orderHistoryCache.set(normalized, history);
      out[normalized] = history;
    }
  }
  // A phone the backend returned nothing for has no deal tickets at all. Cache
  // that as a real zero, so it isn't re-requested on every board render.
  for (const key of missing) {
    if (!out[key]) {
      const zero: ClientOrderHistory = { orders: 0, lifetimeValue: 0, openValue: 0, enquiries: 0, enquiryValue: 0, furthestStatus: null };
      orderHistoryCache.set(key, zero);
      out[key] = zero;
    }
  }
  return out;
}

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
  let deals;
  try {
    deals = await fetchLeadDeals(ph);
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

// ── KAM round-robin load (Inbound PRD §3.5 / Outreach PRD §7) ────────────────
//
// How many closed leads each KAM already holds, so the rotation stays balanced
// across sessions instead of restarting at the top of the roster on every page
// load.
//
// Counted across BOTH lead pipelines, not one. The Outreach PRD says its
// handoff is "on a round-robin basis — consistent with the Inbound module's
// handoff logic", and its open question #2 asks whether the two share a pool or
// rotate separately. Two separate rotations would each pick the KAM who looks
// least loaded to it alone, so the busiest KAM in the CRM keeps winning one of
// them; one shared count is the only reading under which "consistent with
// Inbound" is true. Revisit if KK answers the other way.
export async function fetchKamLoad(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('meta_data')
      .in('pipeline', ['inbound', 'outbound'])
      .eq('stage', 'Closed');
    if (error) throw error;
    const load: Record<string, number> = {};
    for (const row of (data || []) as { meta_data?: Record<string, any> }[]) {
      const kam = String(row.meta_data?.kam || '').trim();
      if (kam) load[kam] = (load[kam] || 0) + 1;
    }
    return load;
  } catch (e) {
    console.error('[b2b] kam load fetch failed', e);
    return {};
  }
}

/** @deprecated Use `fetchKamLoad` — the rotation is one shared pool. */
export const fetchInboundKamLoad = fetchKamLoad;

export interface VerticalRep { name: string; contact: string }

export const B2B_VERTICALS: { label: string; reps: VerticalRep[] }[] = [
  { label: 'Bangalore KAM', reps: [
    { name: 'Tharun', contact: '8309230101' },
    { name: 'Krishna Jadhav', contact: '9187200807' },
  ] },
  { label: 'Inbound', reps: [
    { name: 'Mandeep Ghai', contact: '7223048042' },
    { name: 'Hardi Patel', contact: '9187191018' },
  ] },
  { label: 'Outreach', reps: [
    { name: 'Vilok Reddy', contact: '9980123308' },
    { name: 'Prafful Bhati', contact: '8233435000' },
  ] },
  { label: 'HYD', reps: [
    { name: 'Manikanta', contact: '9059903118' },
    { name: 'Shahrukh Irshad Ali', contact: '9187200815' },
  ] },
];

// One call per vertical carries both buckets: `active` is that vertical's open
// pipeline, `won` is its realised revenue. Both panels read the same fetch, so
// pipeline and revenue can never be scoped differently.
export interface VerticalStats {
  label: string;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
}

export async function fetchVerticalStats(
  range?: { from?: string; to?: string },
): Promise<VerticalStats[]> {
  return Promise.all(
    B2B_VERTICALS.map(async (v) => {
      const stats = await fetchCRMLeadsStats({
        bm: v.reps.map((r) => r.contact).join(','),
        createdFrom: range?.from,
        createdTo: range?.to,
      }).catch((e) => {
        console.error(`[b2b] vertical stats fetch failed (${v.label})`, e);
        return null;
      });
      return {
        label: v.label,
        active: stats?.active ?? EMPTY_BUCKET,
        won: stats?.won ?? EMPTY_BUCKET,
      };
    }),
  );
}

/**
 * Outreach leads. A failed load THROWS rather than resolving to `[]`: this feeds
 * a board a BM works from, and "no leads today" is a very different message from
 * "the database did not answer". `fetchB2BData` catches it for the aggregate
 * dashboards, where an empty vertical is survivable.
 */
export async function fetchOutreachLeads(
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<OutreachLead[]> {
  return (await fetchRows('outbound', opts)).map(rowToOutreach);
}

export async function fetchKamClients(): Promise<KamClient[]> {
  try {
    return (await fetchRows('kam')).map(rowToKam);
  } catch (e) {
    console.error('[b2b] kam DB fetch failed', e);
    return [];
  }
}

// ── Writes (never throw to the UI; resolve to an error message or null) ───────
// Fire-and-forget callers can keep ignoring the result. Bulk import awaits it,
// because "imported 40 clients" is a lie if the upserts silently failed.

async function upsert(row: B2BLeadRow, onConflict: string): Promise<string | null> {
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict });
    if (error) throw error;
    return null;
  } catch (e) {
    console.error('[b2b] upsert failed', e);
    return e instanceof Error ? e.message : String(e);
  }
}

export function upsertInboundLead(l: InboundLead): Promise<string | null> {
  return upsert(inboundToRow(l), 'kylas_lead_id');
}

export function upsertOutreachLead(l: OutreachLead): Promise<string | null> {
  return upsert(outreachToRow(l), 'id');
}

export function upsertKamClient(l: KamClient): Promise<string | null> {
  return upsert(kamToRow(l), 'id');
}

// ── Targets (shared team goals; single config row) ────────────────────────────

const TARGET_TABLE = 'b2b_target';
const TARGET_ROW_ID = 'default';

export async function fetchTargets(): Promise<TargetStore> {
  const base = defaultTargetStore();
  try {
    const { data, error } = await supabase
      .from(TARGET_TABLE)
      .select('monthly_target_l, reps')
      .eq('id', TARGET_ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) return base;
    return {
      monthlyTargetL: Number(data.monthly_target_l) || base.monthlyTargetL,
      reps: { ...base.reps, ...((data.reps as TargetStore['reps']) || {}) },
    };
  } catch (e) {
    console.error('[b2b] fetch targets failed (pre-migration?)', e);
    return base;
  }
}

export async function saveTargets(store: TargetStore): Promise<void> {
  try {
    const { error } = await supabase.from(TARGET_TABLE).upsert(
      { id: TARGET_ROW_ID, monthly_target_l: store.monthlyTargetL, reps: store.reps, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
    if (error) throw error;
  } catch (e) {
    console.error('[b2b] save targets failed', e);
  }
}

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

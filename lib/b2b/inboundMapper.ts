import { B2BLeadRow } from './rows';
import { CallAttempt, InboundStatus, clientTypeFromKylas, decomposeLegacyStage, locationFromPincode, normalizeStatus } from '@/components/b2b/models/inboundModel';
import { InboundLead } from '@/components/b2b/models/mockData';
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

export function rowToInbound(r: B2BLeadRow): InboundLead {
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

export function inboundToRow(l: InboundLead): B2BLeadRow {
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
export function mergeKylasIntoRow(dbLead: InboundLead, kylas: InboundLead): InboundLead {
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


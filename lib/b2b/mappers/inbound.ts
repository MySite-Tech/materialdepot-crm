import { B2BLeadRow } from '../data/rows';
import { CallAttempt, InboundStatus, clientTypeFromKylas, decomposeLegacyStage, locationFromPincode, normalizeStatus } from '@/components/b2b/models/inbound';
import { InboundLead } from '@/components/b2b/models/mock-data';

type MetaKind = 'string' | 'number' | 'array' | 'object';

interface MetaField {
  ui: keyof InboundLead;
  db: string;
  kind: MetaKind;
}

const INBOUND_META: MetaField[] = [

  { ui: 'companyName',        db: 'company_name',         kind: 'string' },
  { ui: 'gstNumber',          db: 'gst_number',           kind: 'string' },
  { ui: 'segment',            db: 'segment',              kind: 'string' },
  { ui: 'clientType',         db: 'client_type',          kind: 'string' },
  { ui: 'leadType',           db: 'lead_type',            kind: 'string' },
  { ui: 'priority',           db: 'priority',             kind: 'string' },
  { ui: 'location',           db: 'location',             kind: 'string' },
  { ui: 'callAttempts',       db: 'call_attempts',        kind: 'array'  },

  { ui: 'selections',         db: 'selections',           kind: 'array'  },
  { ui: 'requirement',        db: 'requirement',          kind: 'string' },
  { ui: 'expectedOrderValue', db: 'expected_order_value', kind: 'number' },

  { ui: 'followUpDate',       db: 'follow_up_date',       kind: 'string' },
  { ui: 'followUpTime',       db: 'follow_up_time',       kind: 'string' },
  { ui: 'enqId',              db: 'enq_id',               kind: 'string' },
  { ui: 'orderValue',         db: 'order_value',          kind: 'number' },
  { ui: 'orderValueSource',   db: 'order_value_source',   kind: 'string' },
  { ui: 'lostReason',         db: 'lost_reason',          kind: 'string' },
  { ui: 'statusChangedAt',    db: 'status_changed_at',    kind: 'string' },

  { ui: 'placedUnder',        db: 'placed_under',         kind: 'object' },
  { ui: 'kam',                db: 'kam',                  kind: 'string' },

  { ui: 'notes',              db: 'notes',                kind: 'array'  },
];

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

  const status: InboundStatus = normalizeStatus(r.stage);
  const legacy = decomposeLegacyStage(r.stage);
  if (legacy.location && !lead.location) lead.location = legacy.location;
  if (legacy.lostReason && !lead.lostReason) lead.lostReason = legacy.lostReason;
  if (legacy.rnr && !(lead.callAttempts as CallAttempt[] | undefined)?.length) {

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

    value: Number(r.value) || 0,
    phone: (lead.phone as string) || '',
    contactName: (lead.contactName as string) || '',
    source: (lead.source as InboundLead['source']) || 'Other',
    calls: [],
  } as unknown as InboundLead;
  out.company = inboundDisplayName(out);

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

    value: Number(l.orderValue) || 0,
    meta_data: meta,
  };
}

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

    requirement: dbLead.requirement || kylas.requirement,
  };
  if (!merged.location) merged.location = locationFromPincode(merged.pincode);
  if (!merged.clientType) merged.clientType = clientTypeFromKylas(merged.presalesClientType);
  merged.company = inboundDisplayName(merged);
  merged.timeline = merged.urgency;
  merged.requirementBrief = merged.leadSummary;
  return merged;
}


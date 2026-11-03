import { B2BLeadRow, InboundRowChange } from '../data/rows';
import { CallAttempt, InboundStatus, clientTypeFromKylas, decomposeLegacyStage, locationFromPincode, normalizeStatus } from '@/components/b2b/models/inbound';
import { InboundLead } from '@/components/b2b/models/mock-data';
import { INVALID_ENQUIRY_REASON } from '@/components/b2b/constants/inbound';

type MetaKind = 'string' | 'number' | 'array' | 'object';

interface MetaField {
  ui: keyof InboundLead;
  db: string;
  kind: MetaKind;
}

const INBOUND_META: MetaField[] = [

  { ui: 'companyName',        db: 'company_name',         kind: 'string' },
  { ui: 'primaryContactName', db: 'primary_contact_name', kind: 'string' },
  { ui: 'primaryContactRole', db: 'primary_contact_role',  kind: 'string' },
  { ui: 'primaryContactPhone', db: 'primary_contact_phone', kind: 'string' },
  { ui: 'additionalContacts', db: 'additional_contacts',  kind: 'array'  },
  { ui: 'gstNumber',          db: 'gst_number',           kind: 'string' },
  { ui: 'segment',            db: 'segment',              kind: 'string' },
  { ui: 'clientType',         db: 'client_type',          kind: 'string' },
  { ui: 'leadType',           db: 'lead_type',            kind: 'string' },
  { ui: 'priority',           db: 'priority',             kind: 'string' },
  { ui: 'location',           db: 'location',             kind: 'string' },
  { ui: 'callAttempts',       db: 'call_attempts',        kind: 'array'  },

  { ui: 'selections',         db: 'selections',           kind: 'array'  },
  { ui: 'requirement',        db: 'requirement',          kind: 'string' },
  { ui: 'requirementHistory', db: 'requirement_history',  kind: 'array'  },
  { ui: 'expectedOrderValue', db: 'expected_order_value', kind: 'number' },

  { ui: 'followUpDate',       db: 'follow_up_date',       kind: 'string' },
  { ui: 'enqId',              db: 'enq_id',               kind: 'string' },
  { ui: 'orderValue',         db: 'order_value',          kind: 'number' },
  { ui: 'orderValueSource',   db: 'order_value_source',   kind: 'string' },
  { ui: 'lostReason',         db: 'lost_reason',          kind: 'string' },
  { ui: 'invalidReason',      db: 'invalid_reason',       kind: 'string' },
  { ui: 'invalidNote',        db: 'invalid_note',         kind: 'string' },
  { ui: 'statusChangedAt',    db: 'status_changed_at',    kind: 'string' },
  { ui: 'piSharedAt',         db: 'pi_shared_at',         kind: 'string' },

  { ui: 'officeLocation',     db: 'office_location',      kind: 'string' },
  { ui: 'outreachReferral',   db: 'outreach_referral',    kind: 'object' },

  { ui: 'placedUnder',        db: 'placed_under',         kind: 'object' },
  { ui: 'revenueCredit',      db: 'revenue_credit',       kind: 'object' },
  { ui: 'kam',                db: 'kam',                  kind: 'string' },
  { ui: 'addedBy',            db: 'added_by',             kind: 'string' },

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

  let status: InboundStatus = normalizeStatus(r.stage);
  if (status === 'Lost' && String(lead.lostReason || '').trim().toLowerCase() === INVALID_ENQUIRY_REASON.toLowerCase()) {
    status = 'Invalid';
    delete lead.lostReason;
  }
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

const APPENDED = new Set(['call_attempts', 'notes', 'requirement_history']);
const SNAPSHOT = new Set(INBOUND_KYLAS_SNAPSHOT.map((f) => f.db));

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function inboundChange(base: InboundLead | null, next: InboundLead): InboundRowChange {
  const to = inboundToRow(next);
  const from = base ? inboundToRow(base) : null;
  const change: InboundRowChange = { meta: {}, append: {} };
  if (!from || from.stage !== to.stage) change.stage = to.stage;
  if (!from || from.owner !== to.owner) change.owner = to.owner;
  if (!from || from.value !== to.value) change.value = to.value;
  for (const [k, v] of Object.entries(to.meta_data)) {
    const was = from?.meta_data[k];
    if (APPENDED.has(k)) {
      const seen = new Set((Array.isArray(was) ? was : []).map(canon));
      const added = (v as unknown[]).filter((item) => !seen.has(canon(item)));
      if (added.length) change.append[k] = added;
    } else if (!from || canon(was) !== canon(v)) {
      change.meta[k] = v;
    }
  }
  return change;
}

export function hasTeamEdits(base: InboundLead, next: InboundLead): boolean {
  const c = inboundChange(base, next);
  return c.stage !== undefined || Object.keys(c.append).length > 0
    || Object.keys(c.meta).some((k) => !SNAPSHOT.has(k) && k !== 'company');
}

export function applyInboundChange(row: B2BLeadRow, change: InboundRowChange): B2BLeadRow {
  const meta: Record<string, any> = { ...row.meta_data, ...change.meta };
  for (const [k, items] of Object.entries(change.append)) {
    const cur: unknown[] = Array.isArray(meta[k]) ? meta[k] : [];
    const seen = new Set(cur.map(canon));
    meta[k] = [...cur, ...items.filter((item) => !seen.has(canon(item)))];
  }
  if (Array.isArray(meta.call_attempts)) {
    meta.call_attempts = [...meta.call_attempts]
      .sort((a, b) => String(a?.at ?? '').localeCompare(String(b?.at ?? '')))
      .map((c, i) => ({ ...c, n: i + 1 }));
  }
  return {
    ...row,
    stage: change.stage ?? row.stage,
    owner: change.owner ?? row.owner,
    value: change.value ?? row.value,
    meta_data: meta,
  };
}


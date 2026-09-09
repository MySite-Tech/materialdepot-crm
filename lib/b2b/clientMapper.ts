import { B2BLeadRow, MetaSpec, arr, str } from './rows';
import { Escalation } from '@/components/b2b/models/accountHealth';
import { ClientContact, ClientEntity, ClientEntityType, ClientGst, ClientInteraction, ClientMergeRecord, ClientSource, KamAssignment, normalizeContactNumber, normalizeGst } from '@/components/b2b/models/clientModel';
import { Segment } from '@/components/b2b/models/inboundModel';

const CLIENT_STAGE = 'Client';

const CLIENT_META: MetaSpec<ClientEntity> = {
  company:       { col: 'company',         read: (v) => String(v ?? '') },
  contacts:      { col: 'contacts',        read: (v) => arr<ClientContact>(v) },
  gsts:          { col: 'gsts',            read: (v) => arr<ClientGst>(v) },
  segment:       { col: 'segment',         read: (v) => str(v) as Segment | undefined },
  clientType:    { col: 'client_type',     read: (v) => str(v) as ClientEntityType | undefined },
  clientTypeRaw: { col: 'client_type_raw', read: str },
  source:        { col: 'source',          read: (v) => (str(v) as ClientSource | undefined) || 'Existing' },
  assignments:   { col: 'assignments',     read: (v) => arr<KamAssignment>(v) },
  remarks:       { col: 'remarks',         read: str },
  interactions:  { col: 'interactions',    read: (v) => arr<ClientInteraction>(v) },
  escalations:   { col: 'escalations',     read: (v) => arr<Escalation>(v) },
  mergedFrom:    { col: 'merged_from',     read: (v) => arr<ClientMergeRecord>(v) },
  createdAt:     { col: 'created_at',      read: str },
  updatedAt:     { col: 'updated_at',      read: str },
};

export function rowToClient(r: B2BLeadRow): ClientEntity {
  const m = r.meta_data || {};
  const c = { id: r.id } as ClientEntity;
  for (const [key, spec] of Object.entries(CLIENT_META) as [keyof ClientEntity, { col: string; read: (v: any) => any }][]) {
    (c as unknown as Record<string, unknown>)[key] = spec.read(m[spec.col]);
  }

  c.contacts = (c.contacts || [])
    .map((x) => ({ ...x, number: normalizeContactNumber(x.number) }))
    .filter((x) => x.number);
  c.gsts = (c.gsts || [])
    .map((x) => ({ ...x, number: normalizeGst(x.number) }))
    .filter((x) => x.number);
  c.kam = str(r.owner);

  if (!c.createdAt) c.createdAt = str(r.created_at);
  return c;
}

export function clientToRow(c: ClientEntity): B2BLeadRow {
  const meta: Record<string, any> = {};
  for (const [key, spec] of Object.entries(CLIENT_META) as [keyof ClientEntity, { col: string }][]) {
    const v = c[key];
    meta[spec.col] = v === undefined ? null : v;
  }
  meta.contacts = (c.contacts || [])
    .map((x) => ({ ...x, number: normalizeContactNumber(x.number) }))
    .filter((x) => x.number);
  meta.gsts = (c.gsts || [])
    .map((x) => ({ ...x, number: normalizeGst(x.number) }))
    .filter((x) => x.number);
  return {
    id: c.id,
    pipeline: 'client',
    stage: CLIENT_STAGE,
    kylas_lead_id: null,
    owner: c.kam || '',
    value: 0,
    meta_data: meta,
  };
}


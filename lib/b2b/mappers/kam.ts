import { B2BLeadRow, MetaSpec, arr, num, str } from '../data/rows';
import { Escalation } from '@/components/b2b/models/account-health';
import { ClientSource } from '@/components/b2b/models/client';
import { KamOrder, isLegacyKamStage, normalizeKamOrderStatus } from '@/components/b2b/models/kam';
import { LeadNote } from '@/components/b2b/models/mock-data';

const KAM_ORDER_META: MetaSpec<KamOrder> = {
  clientId:         { col: 'client_id',          read: str },
  company:          { col: 'company',            read: (v) => String(v ?? '') },
  contactName:      { col: 'contact_name',       read: str },
  phone:            { col: 'phone',              read: str },
  requirement:      { col: 'requirement',        read: str },
  enqId:            { col: 'enq_id',             read: str },
  orderValue:       { col: 'order_value',        read: num },
  orderValueSource: { col: 'order_value_source', read: (v) => (v === 'deal' || v === 'manual' ? v : undefined) },
  dealStatus:       { col: 'deal_status',        read: str },
  expectedClosure:  { col: 'expected_closure',   read: str },
  lostReason:       { col: 'lost_reason',        read: str },
  statusChangedAt:  { col: 'status_changed_at',  read: str },
  source:           { col: 'source',             read: (v) => (str(v) as ClientSource | undefined) || 'Existing' },
  legacyEscalations:{ col: 'escalations',        read: (v) => arr<Escalation>(v) },
  notes:            { col: 'notes',              read: (v) => arr<LeadNote>(v) },
  createdAt:        { col: 'created_at',         read: str },
};

export function rowToKamOrder(r: B2BLeadRow): KamOrder {
  const m = r.meta_data || {};
  const o = { id: r.id, kam: r.owner } as KamOrder;
  for (const [key, spec] of Object.entries(KAM_ORDER_META) as [keyof KamOrder, { col: string; read: (v: any) => any }][]) {
    (o as unknown as Record<string, unknown>)[key] = spec.read(m[spec.col]);
  }
  o.status = normalizeKamOrderStatus(r.stage);
  if (isLegacyKamStage(r.stage)) o.legacyStage = r.stage;

  o.estimatedValue = num(m.estimated_value) ?? num(r.value);

  o.value = Number(o.orderValue) || 0;
  if (!o.createdAt) o.createdAt = str(r.created_at);
  if (!o.phone && m.phone) o.phone = str(m.phone);
  return o;
}

export function kamOrderToRow(o: KamOrder): B2BLeadRow {
  const meta: Record<string, any> = {};
  for (const [key, spec] of Object.entries(KAM_ORDER_META) as [keyof KamOrder, { col: string }][]) {
    const v = o[key];
    meta[spec.col] = v === undefined ? null : v;
  }
  meta.estimated_value = o.estimatedValue ?? null;

  meta.escalations = o.legacyEscalations || [];
  return {
    id: o.id,
    pipeline: 'kam',
    stage: o.status,
    kylas_lead_id: null,
    owner: o.kam,
    value: Number(o.orderValue) || 0,
    meta_data: meta,
  };
}


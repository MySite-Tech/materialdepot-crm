import { B2BLeadRow, MetaSpec, arr, num, str } from './rows';
import { Escalation } from '@/components/b2b/models/accountHealth';
import { ClientSource } from '@/components/b2b/models/clientModel';
import { KamOrder, isLegacyKamStage, normalizeKamOrderStatus } from '@/components/b2b/models/kamModel';
import { LeadNote } from '@/components/b2b/models/mockData';
// ── KAM Active Orders (KAM PRD §5) ───────────────────────────────────────────
//
// The SAME `pipeline='kam'` rows the old board used — 30 of them, live. Nothing
// is rewritten in place; the vocabulary change is applied on read by
// `normalizeKamOrderStatus`, and `estimated_value` falls back to the legacy
// `value` column because that column was a figure a KAM typed on the old form.
//
// The one behavioural change is which column analytics reads. `value` is now
// the deal ticket's order value or 0 — never the estimate. That is the third
// time this exact bug has been fixed on this board family (see
// `OutreachLead.value`), and it means an auto-advanced row contributes real
// rupees or nothing rather than a guess.

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
  // The KAM's estimate. Legacy rows kept it in the `value` column, which is why
  // the fallback is there and why it must never be removed: dropping it would
  // blank the only figure 30 live rows carry.
  o.estimatedValue = num(m.estimated_value) ?? num(r.value);
  // Realised rupees only — the column analytics sums.
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
  // `escalations` used to live on these rows. They belong to the CLIENT now (an
  // escalation is about an account, not one order), and `KamOrder` has no field
  // for them — so they are read into `legacyEscalations` and written straight
  // back. Leaving them out of the writer would silently delete them on the
  // first save of a row that has any, which is precisely the read/write
  // asymmetry `OUTREACH_META` exists to prevent.
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


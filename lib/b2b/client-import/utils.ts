import { GSTIN_SHAPE } from '@/components/b2b/constants/client';
import { ClientEntity, contactNumbers, dealIsOrder, gstNumbers, normalizeContactNumber, normalizeGst } from '@/components/b2b/models/client';
import type { CRMLeadRow } from '@/lib/api/crm/leads';
import type { B2BLeadRow } from '../data/rows';
import { clientToRow, rowToClient } from '../mappers/client';
import { IMPORT_BATCH, IMPORT_ID_PREFIX } from './constants';

interface OrderFirm {
  gsts: Set<string>;
  phones: Map<string, { name: string; at: string }>;
}

const orderKeys = (o: CRMLeadRow): { gst: string; phone: string } | null => {
  if (!dealIsOrder(o.status)) return null;
  const gst = normalizeGst(o.clientGst);
  if (!GSTIN_SHAPE.test(gst)) return null;
  const phone = normalizeContactNumber(o.clientPhone ?? '');
  return { gst, phone: phone.length === 10 ? phone : '' };
};

export function groupOrderFirms(orders: CRMLeadRow[]): OrderFirm[] {
  const parent = new Map<string, string>();
  const root = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const join = (a: string, b: string) => {
    for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k);
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const keyed = orders.flatMap((o) => {
    const k = orderKeys(o);
    if (!k) return [];
    join(`g:${k.gst}`, k.phone ? `p:${k.phone}` : `g:${k.gst}`);
    return [{ o, ...k }];
  });

  const firms = new Map<string, OrderFirm>();
  for (const { o, gst, phone } of keyed) {
    const r = root(`g:${gst}`);
    const firm = firms.get(r) ?? { gsts: new Set(), phones: new Map() };
    firm.gsts.add(gst);
    const at = String(o.orderPlacedAt || o.createdAt || '');
    const seen = firm.phones.get(phone);
    if (phone && (!seen || at > seen.at)) firm.phones.set(phone, { name: String(o.clientName ?? '').trim(), at });
    firms.set(r, firm);
  }
  return [...firms.values()];
}

export function knownClientKeys(rows: B2BLeadRow[]): Set<string> {
  const known = new Set<string>();
  for (const r of rows) {
    if (r.pipeline !== 'client') continue;
    const c = rowToClient(r);
    for (const p of contactNumbers(c.contacts)) known.add(`p:${p}`);
    for (const g of gstNumbers(c.gsts)) known.add(`g:${g}`);
  }
  return known;
}

const isKnown = (firm: OrderFirm, known: Set<string>): boolean =>
  [...firm.gsts].some((g) => known.has(`g:${g}`)) || [...firm.phones.keys()].some((p) => known.has(`p:${p}`));

function firmRow(firm: OrderFirm, at: string): B2BLeadRow {
  const gsts = [...firm.gsts].sort();
  const phones = [...firm.phones.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at));
  const client: ClientEntity = {
    id: `${IMPORT_ID_PREFIX}${gsts[0]}`,
    company: phones.find(([, v]) => v.name)?.[1].name || gsts[0],
    contacts: phones.map(([number, v], i) => ({ number, name: v.name || undefined, primary: i === 0 })),
    gsts: gsts.map((number) => ({ number })),
    source: 'Existing',
    interactions: [],
    escalations: [],
    createdAt: at,
  };
  const row = clientToRow(client);
  return { ...row, meta_data: { ...row.meta_data, import_batch: IMPORT_BATCH } };
}

export function planOrderFirms(orders: CRMLeadRow[], clientRows: B2BLeadRow[], at: string) {
  const firms = groupOrderFirms(orders);
  const known = knownClientKeys(clientRows);
  const unknown = firms.filter((f) => !isKnown(f, known));
  const fresh = unknown.filter((f) => f.phones.size);
  return {
    firmsFound: firms.length,
    alreadyHere: firms.length - unknown.length,
    noPhone: unknown.length - fresh.length,
    rows: fresh.map((f) => firmRow(f, at)),
  };
}

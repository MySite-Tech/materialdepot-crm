import { GSTIN_SHAPE, GST_STATE_NAMES } from '@/components/b2b/constants/client';
import { contactNumbers, dealIsOrder, gstNumbers, normalizeContactNumber, normalizeGst } from '@/components/b2b/models/client';
import type { CRMLeadRow } from '@/lib/api/crm/leads';
import type { B2BLeadRow } from '../../data/rows';
import { rowToClient } from '../../mappers/client';
import { rowToInbound } from '../../mappers/inbound';
import { rowToOutreach } from '../../mappers/outreach';
import { inboundPhones, outreachPhones } from '../../leads/unified';
import { RECENT_ORDERS, REVIEW_ID_PREFIX } from '../constants';
import type { FirmKind, RejectedFirm, ReviewDecision, ReviewFirm, ReviewOrder } from '../types';

interface OrderFirm {
  gsts: Set<string>;
  phones: Map<string, { name: string; at: string }>;
  orders: ReviewOrder[];
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
    const firm: OrderFirm = firms.get(r) ?? { gsts: new Set(), phones: new Map(), orders: [] };
    firm.gsts.add(gst);
    const at = String(o.orderPlacedAt || o.createdAt || '');
    const seen = firm.phones.get(phone);
    if (phone && (!seen || at > seen.at)) firm.phones.set(phone, { name: String(o.clientName ?? '').trim(), at });
    firm.orders.push({ id: o.leadId || o.id, at, store: o.branch || 'Unknown', value: Number(o.cartValue) || 0, status: o.status });
    firms.set(r, firm);
  }
  return [...firms.values()];
}

export function firmKind(gstin: string): FirmKind {
  switch (gstin[5]) {
    case 'C': return 'company';
    case 'F': return 'partnership';
    case 'P': return 'proprietor';
    default: return 'other';
  }
}

export function boardKeys(rows: B2BLeadRow[]): Set<string> {
  const known = new Set<string>();
  const add = (phones: string[], gsts: (string | undefined)[]) => {
    for (const p of phones) known.add(`p:${normalizeContactNumber(p)}`);
    for (const g of gsts) if (g) known.add(`g:${normalizeGst(g)}`);
  };
  for (const r of rows) {
    if (r.pipeline === 'client') {
      const c = rowToClient(r);
      add(contactNumbers(c.contacts), gstNumbers(c.gsts));
    } else if (r.pipeline === 'inbound') {
      const l = rowToInbound(r);
      add(inboundPhones(l), [l.gstNumber]);
    } else if (r.pipeline === 'outbound') {
      const l = rowToOutreach(r);
      add(outreachPhones(l), [l.gstNumber]);
    }
  }
  return known;
}

const keysOf = (gsts: Iterable<string>, phones: Iterable<string>): string[] =>
  [...[...gsts].map((g) => `g:${g}`), ...[...phones].map((p) => `p:${p}`)];

function toReview(firm: OrderFirm): ReviewFirm {
  const gstins = [...firm.gsts].sort();
  const phones = [...firm.phones.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at));
  const orders = [...firm.orders].sort((a, b) => b.at.localeCompare(a.at));
  const stores = new Map<string, number>();
  for (const o of orders) stores.set(o.store, (stores.get(o.store) || 0) + 1);
  return {
    key: `${REVIEW_ID_PREFIX}${gstins[0]}`,
    name: phones.find(([, v]) => v.name)?.[1].name || gstins[0],
    contacts: phones.map(([number, v]) => ({ number, name: v.name || undefined })),
    gstins,
    kind: firmKind(gstins[0]),
    state: GST_STATE_NAMES[gstins[0].slice(0, 2)] || gstins[0].slice(0, 2),
    orders: orders.length,
    value: orders.reduce((n, o) => n + o.value, 0),
    firstOrder: orders[orders.length - 1]?.at || '',
    lastOrder: orders[0]?.at || '',
    stores: [...stores.entries()].map(([name, n]) => ({ name, orders: n })).sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name)),
    recent: orders.slice(0, RECENT_ORDERS),
  };
}

export function planReview(orders: CRMLeadRow[], rows: B2BLeadRow[], decisions: ReviewDecision[]) {
  const onBoard = boardKeys(rows);
  const decided = new Map<string, ReviewDecision>();
  for (const d of decisions) {
    for (const k of keysOf(d.gstins.map(normalizeGst), d.phones.map(normalizeContactNumber))) decided.set(k, d);
    decided.set(`id:${d.key}`, d);
  }
  const firms: ReviewFirm[] = [];
  const rejected: RejectedFirm[] = [];
  let onBoards = 0;
  let noPhone = 0;
  for (const f of groupOrderFirms(orders)) {
    const keys = keysOf(f.gsts, f.phones.keys());
    if (keys.some((k) => onBoard.has(k))) { onBoards++; continue; }
    if (!f.phones.size) { noPhone++; continue; }
    const review = toReview(f);
    const decision = decided.get(`id:${review.key}`) ?? keys.map((k) => decided.get(k)).find(Boolean);
    if (decision) rejected.push({ ...review, decision }); else firms.push(review);
  }
  const byValue = (a: ReviewFirm, b: ReviewFirm) => b.value - a.value || a.key.localeCompare(b.key);
  return { firms: firms.sort(byValue), rejected: rejected.sort(byValue), onBoards, noPhone };
}

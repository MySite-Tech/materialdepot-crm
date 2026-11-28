import type { SkuLine, TicketSkus } from '@/lib/b2b/ticket-skus/types';
import { MD_API_BASE_URL } from '../api/core/config';

const TTL_MS = 60_000;
const TIMEOUT_MS = 20_000;
const cache = new Map<string, { at: number; value: Promise<Snapshot> }>();

type Obj = Record<string, unknown>;

interface Snapshot {
  cart: { cart_number?: unknown; items?: unknown } | null;
  orders: { items?: unknown } | null;
}

const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function cartLines(items: unknown): SkuLine[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    const it = obj(raw);
    if (!it) return [];
    const variant = obj(it.variant);
    const product = obj(variant?.product);
    const qty = num(it.quantity ?? it.qty);
    const rate = num(variant?.selling_price_with_tax ?? product?.selling_price_with_tax ?? it.price);
    return [{
      sku: str(variant?.sku) ?? str(product?.sku) ?? str(it.sku),
      name: str(variant?.private_label_product_name) ?? str(variant?.product_name) ?? str(product?.product_name) ?? str(it.product_name) ?? str(it.name) ?? 'Item',
      brand: str(obj(product?.brand)?.brand_name) ?? str(it.brand),
      category: str(obj(product?.category)?.category_name) ?? str(it.category),
      qty,
      unit: str(variant?.price_unit) ?? str(product?.price_unit) ?? str(it.unit),
      rate,
      total: rate !== null ? rate * (qty ?? 1) : null,
    }];
  });
}

export function billLines(bill: unknown): SkuLine[] {
  const items = obj(bill)?.line_items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    const l = obj(raw);
    if (!l) return [];
    const qty = num(l.quantity);
    const total = num(l.line_value_incl_gst);
    return [{
      sku: str(l.sku),
      name: str(l.name) ?? 'Item',
      brand: str(l.brand),
      category: str(l.category),
      qty,
      unit: null,
      rate: total !== null && qty ? total / qty : null,
      total,
    }];
  });
}

export function skusFor(snapshot: Snapshot, enqId: string): TicketSkus {
  const want = enqId.trim().toUpperCase();
  if (str(snapshot.cart?.cart_number)?.toUpperCase() === want) {
    const lines = cartLines(snapshot.cart?.items);
    if (lines.length) return { status: 'found', source: 'cart', lines };
  }
  const orders = Array.isArray(snapshot.orders?.items) ? (snapshot.orders.items as unknown[]) : [];
  for (const raw of orders) {
    const o = obj(raw);
    if (str(o?.lead_id)?.toUpperCase() !== want) continue;
    const lines = billLines(o?.bill_breakdown);
    if (lines.length) return { status: 'found', source: 'order', lines };
  }
  return { status: 'none' };
}

async function callSnapshot(phone: number): Promise<Snapshot> {
  const key = process.env.MD_SNAPSHOT_API_KEY;
  if (!key) throw new Error('The product lookup is not configured on this deployment (MD_SNAPSHOT_API_KEY is unset).');
  const cf = process.env.MD_CF_ACCESS_TOKEN;
  const res = await fetch(`${MD_API_BASE_URL}/user-cart-order-snapshot/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Api-Key': key, ...(cf ? { 'x-cf-access': cf } : {}) },
    body: JSON.stringify({ phone_numbers: [phone] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  const text = await res.text();
  let json: { results?: unknown; error?: unknown };
  try { json = JSON.parse(text); } catch { throw new Error(`The product lookup returned a non-JSON answer (HTTP ${res.status}).`); }
  if (!res.ok) throw new Error(typeof json.error === 'string' ? `Product lookup: ${json.error}` : `The product lookup answered HTTP ${res.status}.`);
  if (!Array.isArray(json.results)) throw new Error('The product lookup returned no results.');
  const row = obj(json.results[0]);
  return { cart: obj(row?.cart) as Snapshot['cart'], orders: obj(row?.orders) as Snapshot['orders'] };
}

export function readSnapshot(phone: number): Promise<Snapshot> {
  const hit = cache.get(String(phone));
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
  const value = callSnapshot(phone);
  cache.set(String(phone), { at: Date.now(), value });
  value.catch(() => cache.delete(String(phone)));
  return value;
}

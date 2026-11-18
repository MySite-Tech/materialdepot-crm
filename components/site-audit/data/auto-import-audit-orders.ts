import { CITIES, fetchBmEmailsByPhone, phoneKey, sbGet, sbPatchWhere, sbPost, syntheticSiteAuditEmail } from '../shared';
import { autoLinkBmsFromRows } from './resolve-bm-from-backend';
import { AUDIT_SKU } from '../audit-ops/constants';
import { INSTALL_SKU } from '../install-ops/constants';
import { confirmServiceStage, poFieldFor } from './oms-service';
import { getToken } from '@/lib/api';

const AUTO_ATTRIBUTION = 'Auto-import (backend)';

const MAX_AGE_DAYS = 30;

const PAGE_SIZE = 200;

type BackendRow = {
  created_at?: string;
  estimate_lead_id?: string;
  po_number?: string;
  stage_id?: number;
  sales_order_id?: number;

  stage_status?: string | null;
  delivery_date?: string | null;
  goods_delivery_date?: string | null;
  customer?: { name?: string; contact?: number | string } | null;
  shipping_address?: { address?: string; city?: string } | null;
  bm?: { name?: string; contact?: number | string } | null;
  skus?: Array<{ variant_handle?: string; product_name?: string; category_name?: string; is_service?: boolean | null; area_sqft?: number | null }> | null;
};

function cityOfRow(r: BackendRow): string {
  const c = (r.shipping_address && r.shipping_address.city) || '';
  return CITIES.find((known) => known.toLowerCase() === c.trim().toLowerCase()) || CITIES[0];
}

function orderedSkus(r: BackendRow): Array<{ handle: string; name: string; category: string }> {
  return (r.skus || [])
    .filter((s) => s.variant_handle && s.is_service !== true && !/^installation-/.test(String(s.variant_handle)))
    .map((s) => ({
      handle: String(s.variant_handle),
      name: s.product_name || String(s.variant_handle),
      category: s.category_name || '',
    }));
}

function handleText(r: BackendRow): string {
  return (r.skus || [])
    .map((s) => [s.variant_handle, s.product_name, s.category_name].filter(Boolean).join(' '))
    .join(' ');
}

type BmIndex = Map<string, string>;

function bmEmailFor(r: BackendRow, bms: BmIndex): string | null {
  const key = phoneKey(r.bm && r.bm.contact != null ? String(r.bm.contact) : '');
  if (!key) return null;

  return bms.get(key) || syntheticSiteAuditEmail(key);
}

function common(r: BackendRow, now: string, note: string): Record<string, any> {
  return {
    pi: String(r.estimate_lead_id),
    po: poFieldFor(r),
    bm: (r.bm && r.bm.name) || '—',
    customer_name: (r.customer && r.customer.name) || '—',
    phone: r.customer && r.customer.contact ? String(r.customer.contact) : '',
    addr: (r.shipping_address && r.shipping_address.address) || '',
    status: 'pending',
    city: cityOfRow(r),
    log: [{ t: note, d: now }],
    created_by_email: AUTO_ATTRIBUTION,
  };
}

function tickedCategories(text: string): string[] {
  const up = text.toUpperCase();
  const ticked: string[] = [];
  if (up.includes('WF-') || up.includes('FLOOR')) ticked.push('Wooden Flooring');
  if (up.includes('WP-') || up.includes('WALLPAPER') || up.includes('WALL PAPER') || up.includes('WALL-PAPER')) ticked.push('Standard Wallpapers');
  if (up.includes('CWP-') || up.includes('CUSTOM')) ticked.push('Custom Wallpapers');
  if (up.includes('PANEL')) ticked.push('Wall Panels');
  return ticked;
}

function auditPayload(r: BackendRow, now: string, bms: BmIndex): Record<string, any> {
  const ordered = orderedSkus(r);
  const skus: Array<Record<string, any>> = ordered.map((s) => ({ c: s.handle, n: s.name, audit: false }));
  skus.push({ c: AUDIT_SKU, n: 'Site Audit', audit: true });

  const bmEmail = bmEmailFor(r, bms);
  return {
    ...common(r, now, 'Audit order imported automatically from the backend'),
    skus,
    audit_ticked: tickedCategories(handleText(r)),
    ...(bmEmail ? { bm_email: bmEmail } : {}),
  };
}

function tradeOf(s: { handle: string; name: string; category: string }): string | null {
  const hay = (s.name + ' ' + s.category + ' ' + s.handle).toLowerCase();
  if (/panel|wpc|charcoal/.test(hay)) return 'wallpanel';
  if (/wallpaper|wall paper|^wp-|\bwp-/.test(hay)) return 'wallpaper';
  if (/floor|laminate|spc|skirting|beading|reducer|profile|\btf-|\blf-|\bsp-|\bef-/.test(hay)) return 'flooring';
  return null;
}

function serviceTrade(r: BackendRow): string | null {
  for (const s of r.skus || []) {
    const handle = String(s.variant_handle || '');
    if (s.is_service !== true && !handle.startsWith('installation-')) continue;
    const t = tradeOf({ handle, name: s.product_name || '', category: s.category_name || '' });
    if (t) return t;
  }
  return null;
}

export function deliveryDateOf(r: { goods_delivery_date?: string | null; delivery_date?: string | null }): string | null {
  return r.goods_delivery_date || r.delivery_date || null;
}

function installPayload(r: BackendRow, now: string, _bms: BmIndex): Record<string, any> {
  const trade = serviceTrade(r);
  const ordered = orderedSkus(r)
    .map((s) => ({ ...s, trade: tradeOf(s) }))
    .filter((s) => (trade ? s.trade === trade : s.trade !== null));
  const skus: Array<Record<string, any>> = ordered.map((s) => ({ c: s.handle, n: s.name, type: s.trade || trade || 'flooring', audit: false }));
  skus.push({ c: INSTALL_SKU, n: 'Installation', type: 'install', audit: false });
  const custom = /custom|cwp/i.test(handleText(r));
  return {
    ...common(r, now, 'Installation order imported automatically from the backend'),
    skus,
    matched_audit: false,
    delivery_date: deliveryDateOf(r),
    original_delivery_date: deliveryDateOf(r),
    custom_wp: custom,

    subjobs: null,
  };
}

type Kind = {

  param: 'site_audit' | 'installation';
  table: 'audit_orders' | 'install_orders';
  payload: (r: BackendRow, now: string, bms: BmIndex) => Record<string, any>;
};

const AUDIT: Kind = { param: 'site_audit', table: 'audit_orders', payload: auditPayload };
const INSTALL: Kind = { param: 'installation', table: 'install_orders', payload: installPayload };

async function fetchBackendRows(kind: Kind): Promise<BackendRow[]> {
  const token = getToken();
  const res = await fetch(`/api/site-audit/install-pos?type=${kind.param}&page_size=${PAGE_SIZE}`, {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!data || data.error || !Array.isArray(data.results)) {

    console.warn('[site-audit] auto-import skipped:', (data && data.error) || `HTTP ${res.status}`);
    return [];
  }
  return data.results;
}

function leadKey(pi: unknown): string {
  return String(pi).trim().replace(/\s*-\s*(R|\d+)$/i, '');
}

export async function fetchSkuAreas(pi: string): Promise<Map<string, number>> {
  const areas = new Map<string, number>();
  const key = leadKey(pi);
  if (!key) return areas;
  const token = getToken();
  const res = await fetch('/api/site-audit/install-pos?type=installation&page_size=20&search=' + encodeURIComponent(key), {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  for (const r of (data && Array.isArray(data.results) ? data.results : []) as BackendRow[]) {
    if (leadKey(r.estimate_lead_id) !== key) continue;
    for (const s of r.skus || []) {
      if (s.variant_handle && s.area_sqft && !areas.has(s.variant_handle)) areas.set(s.variant_handle, s.area_sqft);
    }
  }
  return areas;
}

async function confirmCompletedJobs(backend: BackendRow[], known: any[]): Promise<number> {
  const completed = new Set(
    known.filter((r: any) => String(r.status) === 'completed').map((r: any) => leadKey(r.pi)),
  );
  if (!completed.size) return 0;
  const stragglers = backend.filter(
    (r) => r.stage_id && r.stage_status === 'held' && completed.has(leadKey(r.estimate_lead_id)),
  );
  let confirmed = 0;
  for (const r of stragglers) {

    if (await confirmServiceStage(Number(r.stage_id), 'Confirmed by CRM reconcile — job already marked completed in the Site Audit tab')) {
      confirmed += 1;
    }
  }
  if (confirmed) console.info('[site-audit] confirmed ' + confirmed + ' completed job(s) back to OMS');
  return confirmed;
}

function staleDeliveryDates(backend: BackendRow[], known: any[]): Map<string, string[]> {
  const goods = new Map<string, string>();
  for (const r of backend) {
    if (r.estimate_lead_id && r.goods_delivery_date) goods.set(String(r.estimate_lead_id), r.goods_delivery_date);
  }
  const byDate = new Map<string, string[]>();
  for (const k of known) {
    const date = goods.get(String(k.pi));
    if (!date || !k.id) continue;
    if (k.status !== 'pending' || k.created_by_email !== AUTO_ATTRIBUTION) continue;
    if ((k.delivery_date || null) !== (k.original_delivery_date || null)) continue;
    if (k.delivery_date === date) continue;
    byDate.set(date, [...(byDate.get(date) || []), String(k.id)]);
  }
  return byDate;
}

async function refreshDeliveryDates(backend: BackendRow[]): Promise<number> {
  const pending = await sbGet(
    'install_orders?select=id,pi,status,delivery_date,original_delivery_date,created_by_email'
    + '&status=eq.pending&created_by_email=eq.' + encodeURIComponent(AUTO_ATTRIBUTION),
  );
  if (!Array.isArray(pending)) return 0;
  let moved = 0;
  for (const [date, ids] of Array.from(staleDeliveryDates(backend, pending))) {
    moved += await sbPatchWhere(
      'install_orders',
      'id=in.(' + ids.join(',') + ')&status=eq.pending',
      { delivery_date: date, original_delivery_date: date },
    );
  }
  if (moved) console.info('[site-audit] moved ' + moved + ' install order(s) to their goods delivery date');
  return moved;
}

async function reconcile(kind: Kind): Promise<number> {
  const [backend, known, bms] = await Promise.all([
    fetchBackendRows(kind),
    sbGet(kind.table + '?select=pi,status'),
    kind.table === 'audit_orders' ? fetchBmEmailsByPhone() : Promise.resolve(new Map() as BmIndex),
  ]);

  if (!Array.isArray(known)) return 0;

  if (kind.table === 'audit_orders') {
    try {
      const linked = await autoLinkBmsFromRows(backend);
      if (linked) console.info('[site-audit] linked ' + linked + ' order(s) to their BM account');
    } catch { /* attribution is a repair, never a reason to fail the reconcile */ }
  }

  let moved = 0;
  if (kind.table === 'install_orders') {
    try {
      moved = await refreshDeliveryDates(backend);
    } catch { /* a stale date is what the row showed before; try again next load */ }
  }

  try {
    await confirmCompletedJobs(backend, known);
  } catch { /* the field app's own retry queue is the other path; try again next load */ }

  const seen = new Set(known.map((r: any) => String(r.pi)));
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const missing = backend.filter((r) => {
    if (!r.estimate_lead_id || seen.has(String(r.estimate_lead_id))) return false;
    const at = r.created_at ? Date.parse(r.created_at.replace(' ', 'T')) : NaN;
    return !Number.isFinite(at) || at >= cutoff;
  });
  if (!missing.length) return moved;

  const now = new Date().toISOString();
  let added = 0;
  for (const row of missing) {
    try {
      await sbPost(kind.table, kind.payload(row, now, bms));
      added += 1;
    } catch {
      /* Another tab won the race, or this one row is malformed — neither is a
         reason to abandon the rest of the batch. */
    }
  }
  return added + moved;
}

const MIN_GAP_MS = 60000;
const runs = new Map<string, { inFlight: Promise<number> | null; finishedAt: number }>();

function run(kind: Kind): Promise<number> {
  const state = runs.get(kind.param) || { inFlight: null, finishedAt: 0 };
  runs.set(kind.param, state);
  if (state.inFlight) return state.inFlight;
  if (Date.now() - state.finishedAt < MIN_GAP_MS) return Promise.resolve(0);
  state.inFlight = reconcile(kind)
    .catch(() => 0)
    .then((added) => { state.finishedAt = Date.now(); state.inFlight = null; return added; });
  return state.inFlight;
}

export function autoImportAuditOrders(): Promise<number> {
  return run(AUDIT);
}

export function autoImportInstallOrders(): Promise<number> {
  return run(INSTALL);
}

export async function autoImportSiteAuditJobs(): Promise<number> {
  const [audits, installs] = await Promise.all([run(AUDIT), run(INSTALL)]);
  return audits + installs;
}

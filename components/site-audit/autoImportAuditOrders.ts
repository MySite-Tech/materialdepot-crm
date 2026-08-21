/* Pulling site-audit jobs in from the backend without anyone clicking.

   A paid site audit exists in the Django/OMS world the moment the order is
   placed (SiteAuditInstallationPOListAPI serves it as a SERVICE stage), but the
   CRM's own tables are only ever written by hand: until someone opens Audit Ops
   → Pending POs and imports the row, the job is invisible to Job Overview, to
   the scheduler and to the auditor's app. That gap is measured in hours —
   ENQ2026082187393 sat unimported because the previous manual pass had already
   run before the order was placed.

   So the reconcile runs on load instead: fetch what the backend has, diff it
   against `audit_orders.pi`, insert what is missing. The Pending POs modal stays
   exactly as it is — it is the manual fallback and the place to fix up a row
   before saving. Rows created here carry `created_by_email: AUTO_ATTRIBUTION`
   so an operator can tell an auto-import from a human one in the log.

   The diff reads EVERY pi, deleted rows included: a deleted order is a decision
   ("not a real audit"), and re-inserting it on the next page load would be the
   worst possible behaviour. `pi` is also uniquely constrained, so two tabs
   racing the same insert ends with one row and one ignored 409. */

import { CITIES, sbGet, sbPost } from './siteAuditShared';
import { AUDIT_SKU } from './audit-ops/shared';
import { poFieldFor } from './omsService';
import { getToken } from '@/lib/mockApi';

export const AUTO_ATTRIBUTION = 'Auto-import (backend)';

/* Audit Ops and Job Overview both call this, and the Role Viewer can mount them
   one after the other — so a run in progress is shared rather than duplicated,
   and a finished one holds the door shut briefly. Long-lived tabs still pick up
   orders placed later: re-mounting or coming back to the tab re-runs it once the
   gap has passed. */
let inFlight: Promise<number> | null = null;
let lastFinishedAt = 0;
const MIN_GAP_MS = 60000;

/* The backend list is ordered newest-first and only its first page is read, but
   that page still reaches back weeks — and the CRM holds ~480 orders against
   ~1360 in scope, most of the difference being pre-CRM history nobody wants
   resurrected into Pending. An age cutoff keeps the reconcile to jobs that are
   actually live work; anything older is still one click away in Pending POs. */
const MAX_AGE_DAYS = 30;

type BackendRow = {
  created_at?: string;
  estimate_lead_id?: string;
  po_number?: string;
  stage_id?: number;
  sales_order_id?: number;
  customer?: { name?: string; contact?: number | string } | null;
  shipping_address?: { address?: string; city?: string } | null;
  bm?: { name?: string } | null;
  skus?: Array<{ variant_handle?: string; product_name?: string }> | null;
};

function cityOfRow(r: BackendRow): string {
  const c = (r.shipping_address && r.shipping_address.city) || '';
  return CITIES.find((known) => known.toLowerCase() === c.trim().toLowerCase()) || CITIES[0];
}

/* Same category heuristics the manual Add Order form applies to its SKU text
   (audit-ops/Overlays.tsx) — the ticks are what the auditor's app keys its
   measurement forms off, so an auto-imported row has to arrive with them. */
function tickedCategories(codes: string[]): string[] {
  const up = codes.join(' ').toUpperCase();
  const ticked: string[] = [];
  if (up.includes('WF-') || up.includes('FLOOR')) ticked.push('Wooden Flooring');
  if (up.includes('WP-') || up.includes('WALL')) ticked.push('Standard Wallpapers');
  if (up.includes('CWP-') || up.includes('CUSTOM')) ticked.push('Custom Wallpapers');
  return ticked;
}

function payloadFor(r: BackendRow, now: string): Record<string, any> {
  const skuRows = (r.skus || []).filter((s) => s.variant_handle);
  const codes = skuRows.map((s) => String(s.variant_handle));
  const skus = skuRows.map((s) => ({ c: String(s.variant_handle), n: s.product_name || String(s.variant_handle), audit: false }));
  skus.push({ c: AUDIT_SKU, n: 'Site Audit', audit: true });

  return {
    pi: String(r.estimate_lead_id),
    po: poFieldFor(r),
    skus,
    audit_ticked: tickedCategories(codes),
    bm: (r.bm && r.bm.name) || '—',
    customer_name: (r.customer && r.customer.name) || '—',
    phone: r.customer && r.customer.contact ? String(r.customer.contact) : '',
    addr: (r.shipping_address && r.shipping_address.address) || '',
    status: 'pending',
    city: cityOfRow(r),
    log: [{ t: 'Order imported automatically from the backend', d: now }],
    created_by_email: AUTO_ATTRIBUTION,
  };
}

async function fetchBackendRows(): Promise<BackendRow[]> {
  const token = getToken();
  const res = await fetch('/api/site-audit/install-pos?type=site_audit&page_size=200', {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!data || data.error || !Array.isArray(data.results)) return [];
  return data.results;
}

async function reconcile(): Promise<number> {
  const [backend, known] = await Promise.all([
    fetchBackendRows(),
    sbGet('audit_orders?select=pi'),
  ]);
  // A PostgREST error resolves as a non-array here, and treating that as "no
  // orders exist yet" would re-import the entire history.
  if (!Array.isArray(known)) return 0;

  const seen = new Set(known.map((r: any) => String(r.pi)));
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const missing = backend.filter((r) => {
    if (!r.estimate_lead_id || seen.has(String(r.estimate_lead_id))) return false;
    const at = r.created_at ? Date.parse(r.created_at.replace(' ', 'T')) : NaN;
    return !Number.isFinite(at) || at >= cutoff;
  });
  if (!missing.length) return 0;

  const now = new Date().toISOString();
  let added = 0;
  for (const row of missing) {
    try {
      await sbPost('audit_orders', payloadFor(row, now));
      added += 1;
    } catch {
      /* Another tab won the race, or this one row is malformed — neither is a
         reason to abandon the rest of the batch. */
    }
  }
  return added;
}

/* Resolves with how many orders were created, so the caller can reload its list
   (and say so) only when something actually changed. Never rejects: a failed
   reconcile must not take a dashboard down with it. */
export function autoImportAuditOrders(): Promise<number> {
  if (inFlight) return inFlight;
  if (Date.now() - lastFinishedAt < MIN_GAP_MS) return Promise.resolve(0);
  inFlight = reconcile()
    .catch(() => 0)
    .then((added) => { lastFinishedAt = Date.now(); inFlight = null; return added; });
  return inFlight;
}

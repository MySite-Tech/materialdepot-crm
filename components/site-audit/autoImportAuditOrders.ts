/* Pulling site-audit and installation jobs in from the backend without anyone
   clicking.

   Both kinds of job exist in the Django/OMS world the moment the order is placed
   (SiteAuditInstallationPOListAPI serves each as a SERVICE stage), but the CRM's
   own tables are only ever written by hand: until someone opens Pending POs and
   imports the row, the job is invisible to Job Overview, to the scheduler and to
   the auditor's / installer's app. That gap is measured in hours —
   ENQ2026082187393 (audit) and ENQ2026082187266 (installation) both sat
   unimported because the last manual pass ran before the order was placed.

   So the reconcile runs on load instead: fetch what the backend has, diff it
   against the CRM table's `pi`, insert what is missing. The Pending POs modals
   stay exactly as they are — they are the manual fallback and the place to fix a
   row up before saving. Rows created here carry
   `created_by_email: AUTO_ATTRIBUTION` so an operator can tell an auto-import
   from a human one in the log.

   The diff reads EVERY pi, deleted rows included: a deleted order is a decision
   ("not a real job"), and re-inserting it on the next page load would be the
   worst possible behaviour. `pi` is also uniquely constrained, so two tabs racing
   the same insert ends with one row and one ignored 409.

   What is deliberately NOT automated: everything after the row exists. Slots,
   auditor/installer assignment and `subjobs` planning stay human — the manual
   flow leaves `subjobs` null too, so an auto-imported order lands in exactly the
   state a hand-imported one does, at Pending, waiting to be scheduled. */

import { CITIES, fetchBmEmailsByPhone, phoneKey, sbGet, sbPost, syntheticSiteAuditEmail } from './siteAuditShared';
import { autoLinkBmsFromRows } from './resolveBmFromBackend';
import { AUDIT_SKU } from './audit-ops/shared';
import { INSTALL_SKU } from './install-ops/shared';
import { poFieldFor } from './omsService';
import { getToken } from '@/lib/mockApi';

export const AUTO_ATTRIBUTION = 'Auto-import (backend)';

/* The backend list is ordered newest-first and only its first page is read, but
   that page still reaches back weeks — and the CRM holds far fewer orders than
   the endpoint has in scope, most of the difference being pre-CRM history nobody
   wants resurrected into Pending. An age cutoff keeps the reconcile to jobs that
   are actually live work; anything older is still one click away in Pending POs. */
const MAX_AGE_DAYS = 30;

const PAGE_SIZE = 200;

type BackendRow = {
  created_at?: string;
  estimate_lead_id?: string;
  po_number?: string;
  stage_id?: number;
  sales_order_id?: number;
  delivery_date?: string | null;
  customer?: { name?: string; contact?: number | string } | null;
  shipping_address?: { address?: string; city?: string } | null;
  bm?: { name?: string; contact?: number | string } | null;
  skus?: Array<{ variant_handle?: string; product_name?: string; category_name?: string; is_service?: boolean | null }> | null;
};

function cityOfRow(r: BackendRow): string {
  const c = (r.shipping_address && r.shipping_address.city) || '';
  return CITIES.find((known) => known.toLowerCase() === c.trim().toLowerCase()) || CITIES[0];
}

/* The goods the job is about, without the service line — that one is the job
   itself and is already represented by the AUDIT_SKU / INSTALL_SKU marker both
   forms append, so passing it through as a SKU too would show the installer a
   phantom material to fit.

   `is_service` is the authority (the backend sets it from `Variant.is_service`);
   the handle prefix is the fallback for a row serialised before the endpoint
   started sending the flag, and for legacy PO rows. A row that predates the
   backend sending the ordered goods at all yields nothing here — the order still
   imports, it just needs its SKUs typed in, exactly as a manual import does. */
function orderedSkus(r: BackendRow): Array<{ handle: string; name: string; category: string }> {
  return (r.skus || [])
    .filter((s) => s.variant_handle && s.is_service !== true && !/^installation-/.test(String(s.variant_handle)))
    .map((s) => ({
      handle: String(s.variant_handle),
      name: s.product_name || String(s.variant_handle),
      category: s.category_name || '',
    }));
}

/* Everything the row says about itself, service line included — the service
   handle is the only place the trade shows up when there are no goods SKUs
   ('installation-00024-customised-wallpaper-…', '…-woonden-flooring-…'). */
function handleText(r: BackendRow): string {
  return (r.skus || [])
    .map((s) => [s.variant_handle, s.product_name, s.category_name].filter(Boolean).join(' '))
    .join(' ');
}

type BmIndex = Map<string, string>;

/* The backend sends the BM's contact number (_site_audit_serialize_bm), which
   fetchBmEmailsByPhone resolves to a BM account. No match ⇒ `bm_email` stays
   unset and the row is linkable by hand in Users, exactly as before. */
function bmEmailFor(r: BackendRow, bms: BmIndex): string | null {
  const key = phoneKey(r.bm && r.bm.contact != null ? String(r.bm.contact) : '');
  if (!key) return null;
  // The account's own address when it exists, else the synthetic one that
  // encodes this phone — the number is what attribution compares either way.
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

/* Same category heuristics the manual Add Order form applies to its SKU text
   (audit-ops/Overlays.tsx) — the ticks are what the auditor's app keys its
   measurement forms off, so an auto-imported row has to arrive with them. */
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
  /* Only on the audit payload: `install_orders` has no `bm_email` column at
     all, and PostgREST rejects the WHOLE insert on an unknown column. */
  const bmEmail = bmEmailFor(r, bms);
  return {
    ...common(r, now, 'Audit order imported automatically from the backend'),
    skus,
    audit_ticked: tickedCategories(handleText(r)),
    ...(bmEmail ? { bm_email: bmEmail } : {}),
  };
}

/* Which trade a line belongs to, or null when nothing in it says. Deliberately
   positive-match only: the endpoint reports every product on the sales order, and
   an order can carry things no installer touches (a napkin ring and a soap dish
   rode along with ENQ2026082187214's SPC floor). Defaulting the unknowns to
   flooring the way the form's own guess does would list those as material to
   fit. */
function tradeOf(s: { handle: string; name: string; category: string }): string | null {
  const hay = (s.name + ' ' + s.category + ' ' + s.handle).toLowerCase();
  if (/panel|wpc|charcoal/.test(hay)) return 'wallpanel';
  if (/wallpaper|wall paper|^wp-|\bwp-/.test(hay)) return 'wallpaper';
  if (/floor|laminate|spc|skirting|beading|reducer|profile|\btf-|\blf-|\bsp-|\bef-/.test(hay)) return 'flooring';
  return null;
}

/* The trade the SERVICE line is for — 'installation-00030-woonden-flooring-…',
   '…-standard-wall-paper-installation-…'. This is what the goods are filtered
   against, so an install order lists the floor and its profiles but not the
   bathroom fittings that shared the order. */
function serviceTrade(r: BackendRow): string | null {
  for (const s of r.skus || []) {
    const handle = String(s.variant_handle || '');
    if (s.is_service !== true && !handle.startsWith('installation-')) continue;
    const t = tradeOf({ handle, name: s.product_name || '', category: s.category_name || '' });
    if (t) return t;
  }
  return null;
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
    delivery_date: r.delivery_date || null,
    original_delivery_date: r.delivery_date || null,
    custom_wp: custom,
    /* Explicit, because the column defaults to `[]` and an empty array is
       TRUTHY: `isSplit`, the drawer's sub-job section and the sub-jobs column all
       branch on `o.subjobs` and would read a planned-but-empty order instead of
       an unplanned one. Hand-made rows carry null; so must these. */
    subjobs: null,
  };
}

type Kind = {
  /* `type` param the backend list is filtered by, and the CRM table its rows
     land in — the only two things that differ between the audit and install
     reconciles besides the payload shape. */
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
    /* Silence here reads exactly like "the backend has nothing to import", which
       is the wrong conclusion to draw from a proxy error. Say so instead of
       importing nothing quietly. */
    console.warn('[site-audit] auto-import skipped:', (data && data.error) || `HTTP ${res.status}`);
    return [];
  }
  return data.results;
}

async function reconcile(kind: Kind): Promise<number> {
  const [backend, known, bms] = await Promise.all([
    fetchBackendRows(kind),
    sbGet(kind.table + '?select=pi'),
    kind.table === 'audit_orders' ? fetchBmEmailsByPhone() : Promise.resolve(new Map() as BmIndex),
  ]);
  // A PostgREST error resolves as a non-array here, and treating that as "no
  // orders exist yet" would re-import the entire history.
  if (!Array.isArray(known)) return 0;

  /* Attribution repair, before the insert diff and regardless of it: rows the
     store counter created carry a typed BM name and no account link, and the
     page of jobs just fetched names the real owner of each enquiry. What this
     fixes is EXISTING rows, so it must not be gated on there being something
     new to import. */
  if (kind.table === 'audit_orders') {
    try {
      const linked = await autoLinkBmsFromRows(backend);
      if (linked) console.info('[site-audit] linked ' + linked + ' order(s) to their BM account');
    } catch { /* attribution is a repair, never a reason to fail the reconcile */ }
  }

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
      await sbPost(kind.table, kind.payload(row, now, bms));
      added += 1;
    } catch {
      /* Another tab won the race, or this one row is malformed — neither is a
         reason to abandon the rest of the batch. */
    }
  }
  return added;
}

/* Audit Ops, Install Ops and Job Overview all reconcile, and the Role Viewer can
   mount them one after the other — so a run in progress is shared rather than
   duplicated, and a finished one holds the door shut briefly. Long-lived tabs
   still pick up orders placed later: re-mounting or returning to the tab re-runs
   it once the gap has passed. Tracked per kind, since the two run independently. */
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

/* Each resolves with how many orders were created, so the caller can reload its
   list (and say so) only when something actually changed. Never reject: a failed
   reconcile must not take a dashboard down with it. */
export function autoImportAuditOrders(): Promise<number> {
  return run(AUDIT);
}

export function autoImportInstallOrders(): Promise<number> {
  return run(INSTALL);
}

/* For views that show both kinds — Job Overview. */
export async function autoImportSiteAuditJobs(): Promise<number> {
  const [audits, installs] = await Promise.all([run(AUDIT), run(INSTALL)]);
  return audits + installs;
}

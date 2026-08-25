'use client';

/* Did the site audit turn into an order — and if it didn't, where did it stop?

   A site audit is not the product; it is the step that is supposed to lead to
   one. So the question a BM's order book has to answer is not just "was the
   audit done" but "did this client go on to build a cart, get a quotation, and
   place the order — and if they went quiet, which step were they on when they
   did". Until now the BM dashboard could only show the audit and the manual
   `bm_journey` notes somebody remembered to type.

   The steps come from the CRM's OWN deal pipeline (Django, `/crm/leads/`),
   which is where carts, quotations and orders actually live — the same rows the
   Leads tab renders. `coe-ops/shared.ts`'s `orderPlacedFor` carries a comment
   saying that when "Material Depot's other system exposes carts and
   product-only orders" it is the one function that has to change; this module is
   that exposure, reached from inside the CRM rather than from the field app. The
   two are kept deliberately consistent: an installation order on or after the
   audit day still counts as an order placed, exactly as the COE's queue
   already treats it.

   THREE RULES THIS MODULE WILL NOT BEND:

   1. Deals are scoped to the audit, never to the phone's whole history. A
      client can have several audits and several orders, so "this number ever
      ordered" would mark a fresh audit converted off the back of an unrelated
      one from last year — the same trap `orderPlacedFor` documents. Only deals
      created on or after the audit day count; earlier ones are reported
      separately as context and never as conversion.
   2. Matching is exact. A deal is tied to an audit by the client's phone digits
      (`phoneKey`, last 10 — the same normalisation both order tables and the
      b2b board already use on both sides of a join) and by nothing else. No
      name matching, no similarity, no "probably the same person".
   3. A failed request is never an answer. `fetchCRMLeads` throwing means we do
      not know whether a cart exists; that is reported as unknown, never as
      "no cart" — the difference between "the client never came back" and "the
      pipeline didn't load" is the entire point of the screen. (`fetchLeadDeals`
      in lib/mockApi swallows its own errors into `[]`, which is exactly that
      landmine, so this module calls `fetchCRMLeads` directly instead.) */

import { fetchCRMLeads, type CRMLeadRow } from '@/lib/mockApi';
import { phoneKey } from './siteAuditShared';

/* The deal pipeline, in the order a deal moves through it. Mirrors the
   `STATUSES` literal in app/App.tsx — the CRM's own vocabulary, which is not
   exported from that 3.3k-line client component. `components/b2b/kamAutoStage.ts`
   already re-declares the same map locally for the same reason; if a status is
   ever added there, add it here too. Anything unlisted is unranked and cannot
   advance the funnel (guessing where a new status sits would silently mark
   clients converted). */
const DEAL_PIPELINE = [
  'In Cart',
  'Quote Approval Pending',
  'Availability Check',
  'Hold Stock',
  'Order Placed',
  'Order Confirmed',
  'Partly Shipped',
  'Shipped',
  'Partly Delivered',
  'Delivered',
];

/* Resolutions, not stages: a deal sitting here has stopped moving forward.
   `Refunded` is included because from the audit's point of view the order came
   back — it is not a client still deciding. */
const DEAL_LOST = new Set(['Refunded', 'Order Lost', 'Order Cancelled']);

function dealRank(status: string | null | undefined): number {
  const i = DEAL_PIPELINE.indexOf(String(status || ''));
  return i;
}
const RANK_QUOTE = DEAL_PIPELINE.indexOf('Quote Approval Pending');
const RANK_ORDER = DEAL_PIPELINE.indexOf('Order Placed');

/* ── The ladder ───────────────────────────────────────────────────────────
   Six steps, in order, each answering one yes/no question a BM is actually
   asked in a review. `quote_shared` is deliberately worded as the quotation
   being sent for approval rather than "PI shared": the deal pipeline has no
   distinct PI status (the Footfall/Weekly Funnel dashboards' PI column is
   computed server-side from data this endpoint doesn't return), so claiming to
   know a PI went out would be inventing precision. */
export type FunnelStepKey =
  | 'audit_done' | 'cart_created' | 'quote_shared' | 'order_placed' | 'install_ordered' | 'installed';

export type FunnelStepDef = { k: FunnelStepKey; label: string; short: string; hint: string };

export const FUNNEL_STEPS: FunnelStepDef[] = [
  { k: 'audit_done', label: 'Site audit completed', short: 'Audit', hint: 'The auditor finished the visit and signed off the job card.' },
  { k: 'cart_created', label: 'Cart created', short: 'Cart', hint: 'A deal exists in the CRM for this client, raised on or after the audit.' },
  { k: 'quote_shared', label: 'Quotation shared', short: 'Quote', hint: 'The cart reached quote approval — the estimate has gone to the client.' },
  { k: 'order_placed', label: 'Order placed', short: 'Order', hint: 'The client confirmed the order.' },
  { k: 'install_ordered', label: 'Installation ordered', short: 'Install order', hint: 'An installation service order was raised for this client after the audit.' },
  { k: 'installed', label: 'Installation completed', short: 'Installed', hint: 'The installer finished the job on site.' },
];

export type FunnelState =
  /* a direct signal, with the timestamp that produced it */
  | 'done'
  /* a LATER step is done, so this one must have happened, but nothing on this
     side records it — almost always a cart raised under a different phone
     number. Shown as reached, flagged as unrecorded, never counted as a stall. */
  | 'implied'
  /* the source that would answer this couldn't be read. NOT the same as
     'pending': reporting an unreadable pipeline as "no cart yet" is the one
     mistake that would send a BM to chase a client who has already ordered,
     and it would inflate the "waiting on cart" count on every dashboard the
     moment Django went quiet. */
  | 'unknown'
  /* not reached */
  | 'pending';

export type FunnelStep = FunnelStepDef & {
  state: FunnelState;
  at: string | null;      // YYYY-MM-DD or ISO, whatever the source carries
  ref: string;            // cart/enquiry/PI id behind it, when there is one
  detail: string;         // one line naming the evidence
};

export type Funnel = {
  steps: FunnelStep[];
  /* Furthest step actually reached. */
  furthest: FunnelStepKey;
  /* The step the client is sitting on — the first unreached one. `null` once
     the whole ladder is done, and also `null` when the answer is unknown
     rather than negative (see `unknownFrom`). THIS is the drop-off answer. */
  stalledAt: FunnelStepDef | null;
  /* Set instead of `stalledAt` when the ladder runs into an unreadable source:
     the first step we cannot answer. Never counted as a drop-off. */
  unknownFrom: FunnelStepDef | null;
  /* Set when the furthest deal was resolved as lost/cancelled/refunded: the
     client didn't go quiet, somebody wrote down why they left. */
  lost: { status: string; reason: string; at: string; ref: string } | null;
  /* Deals on this number raised BEFORE the audit. Context only — never
     conversion (see rule 1). */
  priorDeals: number;
  /* Total cart value of the scoped deals, for the ones that exist. */
  value: number;
  /* False when the CRM pipeline couldn't be read for this client, so
     cart/quote/order are unknown rather than absent (rule 3). */
  pipelineKnown: boolean;
};

export type FunnelInput = {
  /* The day the audit happened — `date`, falling back to the row's creation
     date, matching coe-ops' `anchorDate`. */
  auditDate: string | null;
  auditCompleted: boolean;
  auditCompletedAt: string | null;
  /* Deals for this client's phone, or null when the pipeline couldn't be read. */
  deals: CRMLeadRow[] | null;
  /* The installation order raised off this audit, if there is one. */
  install: { pi: string; createdAt: string | null; status: string } | null;
  /* A custom-wallpaper production run counts as an order placed even when the
     deal itself is invisible to us — the vendor is already printing. */
  wpRun: { pi: string; placedAt: string | null } | null;
  /* An explicit human tick always outranks a derived signal: the COE's
     `coe_track.order_placed` and the BM's own `bm_journey` order_placed entry
     both cover carts and product-only orders this pipeline can't see. */
  declaredOrderAt: string | null;
  declaredOrderRef: string;
};

function dayOf(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : '';
}

/* Deals raised on or after the audit day, furthest-progressed first. */
function scopeDeals(deals: CRMLeadRow[], auditDate: string | null): CRMLeadRow[] {
  const anchor = dayOf(auditDate);
  const scoped = anchor ? deals.filter((d) => dayOf(d.createdAt) >= anchor) : deals;
  return scoped.slice().sort((a, b) => dealRank(b.status) - dealRank(a.status));
}

export function funnelFor(input: FunnelInput): Funnel {
  const pipelineKnown = Array.isArray(input.deals);
  const all = input.deals || [];
  const scoped = scopeDeals(all, input.auditDate);
  const anchor = dayOf(input.auditDate);
  const priorDeals = anchor ? all.filter((d) => dayOf(d.createdAt) < anchor).length : 0;

  /* `scoped` is sorted furthest-first and lost statuses are unranked (-1), so a
     live deal always sorts ahead of a resolved one. */
  const ranked = scoped.filter((d) => dealRank(d.status) >= 0);
  const best = ranked[0] || null;
  const bestRank = best ? dealRank(best.status) : -1;
  /* A cart existing at all is what proves the cart step — including a cart that
     was later lost, which was still a cart. `best` (live deals only) can't
     answer that, because a client whose only deal was cancelled would then
     render as never having built one. */
  const anyDeal = scoped[0] || null;
  const lostDeal = scoped.find((d) => DEAL_LOST.has(String(d.status || ''))) || null;

  const installOrderedAt = input.install?.createdAt || null;
  const installedAt = input.install && input.install.status === 'completed' ? input.install.createdAt : null;

  /* Order placed, from any of the four things that can prove it. Ordered by how
     directly each one says "the client committed". */
  const orderEvidence: Array<{ at: string | null; ref: string; detail: string }> = [];
  if (input.declaredOrderAt) orderEvidence.push({ at: input.declaredOrderAt, ref: input.declaredOrderRef, detail: 'Recorded by the team' });
  if (bestRank >= RANK_ORDER && best) orderEvidence.push({ at: best.createdAt || null, ref: best.id || '', detail: 'CRM deal · ' + best.status });
  if (input.wpRun) orderEvidence.push({ at: input.wpRun.placedAt, ref: input.wpRun.pi, detail: 'Custom wallpaper in production' });
  if (input.install) orderEvidence.push({ at: installOrderedAt, ref: input.install.pi, detail: 'Installation order raised' });
  const order = orderEvidence[0] || null;

  const raw: Record<FunnelStepKey, { at: string | null; ref: string; detail: string } | null> = {
    audit_done: input.auditCompleted ? { at: input.auditCompletedAt || input.auditDate, ref: '', detail: 'Job card signed off' } : null,
    cart_created: anyDeal ? { at: anyDeal.createdAt || null, ref: anyDeal.id || '', detail: 'CRM deal · ' + anyDeal.status } : null,
    quote_shared: best && bestRank >= RANK_QUOTE ? { at: best.createdAt || null, ref: best.id || '', detail: 'Reached ' + best.status } : null,
    order_placed: order,
    install_ordered: input.install ? { at: installOrderedAt, ref: input.install.pi, detail: 'Service order ' + input.install.pi } : null,
    /* `installedAt` is null for a completed job whose row carries no date, so the
       status is what decides — the date is only decoration. */
    installed: input.install && input.install.status === 'completed'
      ? { at: installedAt, ref: input.install.pi, detail: 'Installation completed' }
      : null,
  };

  /* Furthest reached wins, so a step with no local evidence below a step that
     has some reads as `implied` rather than as a gap the client fell through.
     Without this, an order raised under a second phone number would render as
     "no cart, no quote, order placed" and send a BM chasing a client who has
     already paid. */
  const lastDone = FUNNEL_STEPS.reduce((acc, s, i) => (raw[s.k] ? i : acc), -1);

  const steps: FunnelStep[] = FUNNEL_STEPS.map((def, i) => {
    const hit = raw[def.k];
    if (hit) return { ...def, state: 'done' as FunnelState, at: hit.at, ref: hit.ref, detail: hit.detail };
    if (i < lastDone) {
      return {
        ...def, state: 'implied' as FunnelState, at: null, ref: '',
        detail: def.k === 'cart_created' || def.k === 'quote_shared'
          ? 'Not visible in the CRM pipeline — the cart may be under a different number'
          : 'Not recorded, but a later step is done',
      };
    }
    /* Cart, quotation and order are the three the deal pipeline answers; the
       audit and installation steps come from Supabase and stay valid even when
       Django is unreachable. */
    if (!pipelineKnown && (def.k === 'cart_created' || def.k === 'quote_shared' || def.k === 'order_placed')) {
      return { ...def, state: 'unknown' as FunnelState, at: null, ref: '', detail: "Couldn't read the CRM pipeline — unknown, not absent" };
    }
    return { ...def, state: 'pending' as FunnelState, at: null, ref: '', detail: '' };
  });

  /* Walk the ladder from the top and stop at the first step that isn't reached.
     If that step is one we couldn't answer, this client has no drop-off — it
     has a gap in the data, and saying so is the whole point of rule 3. */
  const firstOpen = steps.find((s) => s.state === 'pending' || s.state === 'unknown') || null;
  const stalledAt = firstOpen && firstOpen.state === 'pending' ? firstOpen : null;
  const unknownFrom = firstOpen && firstOpen.state === 'unknown' ? firstOpen : null;
  const asDef = (s: FunnelStep | null): FunnelStepDef | null => (s ? { k: s.k, label: s.label, short: s.short, hint: s.hint } : null);

  return {
    steps,
    furthest: (lastDone >= 0 ? FUNNEL_STEPS[lastDone].k : 'audit_done'),
    stalledAt: asDef(stalledAt),
    unknownFrom: asDef(unknownFrom),
    /* Lost is only the story when nothing else is still moving. A client whose
       first cart was cancelled and whose second is in quote approval has not
       been lost — reporting them as lost would retire a live opportunity. */
    lost: lostDeal && !best && !raw.order_placed
      ? {
        status: String(lostDeal.status || ''),
        reason: lostDeal.lostReason || '',
        at: lostDeal.lostMarkDate || lostDeal.closureDate || '',
        ref: lostDeal.id || '',
      }
      : null,
    priorDeals,
    value: scoped.reduce((s, d) => s + (Number(d.cartValue) || 0), 0),
    pipelineKnown,
  };
}

/* ── Loading deals ────────────────────────────────────────────────────────
   One request per client phone (`/crm/leads/?q=<phone>`), because the batched
   `/crm/leads/client-order-history/` endpoint returns a LIFETIME furthest
   status with no dates on it — which cannot be scoped to an audit, and so
   cannot answer this question without breaking rule 1.

   That makes the request count the thing to keep honest, hence: a module-level
   cache (the same shape `lib/b2bLeads.ts` uses for order histories, so
   re-entering the tab is free), a small concurrency pool, and a hard cap with
   the overflow REPORTED rather than silently dropped. */

const dealCache = new Map<string, CRMLeadRow[]>();
const CONCURRENCY = 4;

/* A BM's own order book is tens of rows; a whole-store rollup is hundreds. Past
   this many clients the funnel stops being a page load and starts being a
   crawl, so it is cut off and the caller says so. */
export const FUNNEL_PHONE_CAP = 80;

export type DealsResult = {
  /* phoneKey → deals, or null for a client whose request failed (rule 3). */
  byPhone: Map<string, CRMLeadRow[] | null>;
  /* Clients left out by the cap — surfaced, never silent. */
  skipped: number;
  /* True when no request succeeded at all: almost always a session/permission
     problem rather than N unlucky clients, and worth saying once. */
  allFailed: boolean;
};

export async function loadDealsForPhones(phones: (string | null | undefined)[]): Promise<DealsResult> {
  const wanted = [...new Set(phones.map((p) => phoneKey(p)).filter((k) => k.length === 10))];
  const byPhone = new Map<string, CRMLeadRow[] | null>();
  const missing: string[] = [];
  for (const k of wanted) {
    if (dealCache.has(k)) byPhone.set(k, dealCache.get(k)!);
    else missing.push(k);
  }
  const take = missing.slice(0, FUNNEL_PHONE_CAP);
  const skipped = missing.length - take.length;
  if (!take.length) return { byPhone, skipped, allFailed: false };

  let ok = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= take.length) return;
      const key = take[i];
      try {
        const { results } = await fetchCRMLeads({ q: key, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' });
        /* Keyed on OUR normalised digits, not the backend's raw contact string,
           and re-filtered on the phone because `q` is a free-text search that
           also matches names and cart ids — a client whose name contains the
           digits would otherwise inherit somebody else's deals. */
        const mine = (results || []).filter((r) => phoneKey(r.clientPhone) === key);
        dealCache.set(key, mine);
        byPhone.set(key, mine);
        ok++;
      } catch {
        /* Unknown, not empty. Deliberately NOT cached — a blip must not pin a
           client to "pipeline unreadable" for the life of the tab. */
        byPhone.set(key, null);
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, take.length) }, worker));
  return { byPhone, skipped, allFailed: ok === 0 && failed > 0 };
}

/* Drops one client's cached deals, so a BM who has just raised a cart can see
   it without waiting out the tab's lifetime. */
export function forgetDeals(phone: string | null | undefined): void {
  const k = phoneKey(phone);
  if (k) dealCache.delete(k);
}

/* ── Presentation ─────────────────────────────────────────────────────────── */

export const FUNNEL_BADGE: Record<FunnelStepKey, string> = {
  audit_done: 'bg-gray-100 text-gray-600',
  cart_created: 'bg-indigo-100 text-indigo-700',
  quote_shared: 'bg-amber-100 text-amber-800',
  order_placed: 'bg-orange-100 text-orange-800',
  install_ordered: 'bg-sky-100 text-sky-700',
  installed: 'bg-green-100 text-green-700',
};

/* What to put on a list row: the step the client is stuck on, or the finish
   line. A stall is the more useful of the two, so it wins the label. */
export function funnelChip(f: Funnel): { label: string; badge: string; tone: 'stall' | 'lost' | 'done' | 'unknown' } {
  if (f.lost) return { label: f.lost.reason ? 'Lost · ' + f.lost.reason : 'Lost', badge: 'bg-red-100 text-red-700', tone: 'lost' };
  /* Checked before the stall, so a client we simply couldn't look up is never
     labelled as one who went quiet. */
  if (f.unknownFrom) return { label: f.unknownFrom.short + ' unknown', badge: 'bg-gray-100 text-gray-500', tone: 'unknown' };
  if (!f.stalledAt) return { label: 'Installed', badge: FUNNEL_BADGE.installed, tone: 'done' };
  return { label: 'Waiting on: ' + f.stalledAt.short, badge: FUNNEL_BADGE[f.furthest], tone: 'stall' };
}

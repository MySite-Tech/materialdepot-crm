'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { avgScore, inCity, npsFrom, sbGetLong, JOB_STATUS, NPS_BAND_LABELS, NPS_HOUSE_NOTE, SQFT_PER_ROLL, type CityFilter } from './siteAuditShared';
import { typeLabel } from './auditRegistry';
import CatAnalyticsPanel, { type CommercialTab } from './CatAnalyticsPanel';
import { catAnalyticsIfLoaded, downloadCsv, loadCatAnalytics, type CatAnalyticsApi } from './catAnalytics';

/* ---- ANALYTICS HELPERS (ported verbatim from material-depot-site Admin.jsx lines 202-334) ---- */
function _anDstr(d: Date) {
  const z = (n: number) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
function _anToIST(iso: string) {
  return new Date(new Date(iso).getTime() + 19800000);
}
function _anDateIST(iso: string) {
  return _anToIST(iso).toISOString().substring(0, 10);
}
function _anMinsIST(iso: string) {
  const d = _anToIST(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
// The clock time an arrival was logged, for the drill-down to print next to the booked slot —
// "10:04 vs 10:00" is the evidence behind a late row, where "late" alone is just an assertion.
function _anHhMmIST(iso: string) {
  const m = _anMinsIST(iso);
  const z = (n: number) => (n < 10 ? '0' + n : '' + n);
  return z(Math.floor(m / 60)) + ':' + z(m % 60);
}

function _anInstallAttempts(installs: any[], from: string, to: string) {
  const out: any[] = [];
  for (const o of installs) {
    for (const sj of o.subjobs || []) {
      const isCompleted = ['completed', 'partial'].includes(sj.status);
      const dates = new Set<string>();
      if (isCompleted) {
        const complKey = typeLabel(sj.type) + ' installation completed';
        for (const l of o.log || []) {
          if (l.t && l.d && l.t.startsWith(complKey)) {
            const cd = _anDateIST(l.d);
            if (cd) dates.add(cd);
          }
        }
        if (!dates.size) {
          if (sj.date) dates.add(sj.date);
          for (const a of sj.assignments || []) {
            if (a.mode === 'custom') (a.dates || []).forEach((d: string) => dates.add(d));
            else if (a.date) dates.add(a.date);
          }
        }
      } else {
        if (sj.date) dates.add(sj.date);
        for (const a of sj.assignments || []) {
          if (a.mode === 'custom') (a.dates || []).forEach((d: string) => dates.add(d));
          else if (a.date) dates.add(a.date);
        }
      }
      for (const d of dates) {
        if (d < from || d > to) continue;
        const asgns = (sj.assignments || []).filter((a: any) => (a.mode === 'custom' ? (a.dates || []).includes(d) : a.date === d));
        const primary = asgns.find((a: any) => a.primary) || asgns[0] || null;
        out.push({
          pi: o.pi,
          // orderId/sjId identify the sub-job a rating belongs to. A multi-day
          // sub-job emits one attempt row PER DATE, so these are also what
          // collapses those rows back to one job before ratings are counted —
          // without that a two-day installation would count its single rating
          // twice.
          orderId: o.id,
          sjId: sj.id,
          // jobcard.sign is present in install_orders_slim (the signature is a
          // URL, not a blob), so job-card completion can be measured from the
          // signature itself instead of inferred from a rating existing.
          sign: (sj.jobcard && sj.jobcard.sign) || null,
          type: sj.type,
          status: sj.status,
          date: d,
          slot: primary ? (primary.slots && primary.slots[0]) || '' : sj.slot || '',
          installers: asgns.length ? asgns : sj.assignments || [],
          items: sj.items || [],
          auditBy: o.service && o.service.audit_by,
          hasDelay: !!(o.original_delivery_date && o.delivery_date && o.original_delivery_date !== o.delivery_date),
          logDelay: (o.log || []).some((l: any) => l.t && /delay/i.test(l.t)),
          originalDelivery: o.original_delivery_date || null,
          currentDelivery: o.delivery_date || null,
          order: o,
        });
      }
    }
  }
  return out;
}

/* Returns the per-person tally the tiles and the per-person tables use, PLUS `tagged` — one row
   per arrival that was actually counted, so the metric drill-down can show WHICH visits were on
   time and which were late instead of only how many. `tagged` is derived in the same loop as the
   tally, deliberately: a drill that disagrees with the tile it opened from is worse than no drill,
   so there is exactly one place that decides whether an arrival counts. */
function _anArrivalStats(orders: any[], trackFrom: string, trackTo: string, isInstall: boolean) {
  const map: Record<string, { onTime: number; late: number }> = {};
  const tagged: Array<{ pi: string; date: string; order: any; who: string; slot: string; arrivedAt: string; diff: number; bucket: 'onTime' | 'late' }> = [];
  const seenVisits = new Set<string>();
  for (const o of orders) {
    for (const l of o.log || []) {
      if (!l.t || !l.d || !l.who) continue;
      if (!l.t.toLowerCase().includes('arrived at site')) continue;
      const dateIST = _anDateIST(l.d);
      if (dateIST < trackFrom || dateIST > trackTo) continue;
      /* One person, one order, one day = ONE visit, however many times the field app wrote the log
         line. Without this the same arrival is counted twice (or twenty times — ENQ2026080884597
         carries 20 identical "arrived at site" rows for one auditor on 2026-08-10), which on live
         data as of 2026-08-26 inflated the install metric by 13% and the audit metric by 23%. The
         PWA's Admin console has always deduped this way; this port did not, and the mismatch only
         became visible once the tiles started listing their own rows. */
      const visitKey = o.pi + '|' + l.who + '|' + dateIST;
      if (seenVisits.has(visitKey)) continue;
      let slot = '';
      if (isInstall) {
        for (const sj of o.subjobs || []) {
          const sjDate = sj.date || (sj.assignments && sj.assignments[0] && sj.assignments[0].date) || '';
          if (sjDate === dateIST) {
            const a = (sj.assignments || []).find((a: any) => a.installer_name === l.who);
            slot = a ? (a.slots && a.slots[0]) || '' : sj.slot || '';
            break;
          }
        }
      } else {
        if (o.date === dateIST) slot = o.slot || '';
      }
      if (!slot || !/^\d{1,2}:\d{2}$/.test(slot)) continue;
      const [sh, sm2] = slot.split(':').map(Number);
      const mins = _anMinsIST(l.d);
      const diff = mins - (sh * 60 + sm2);
      const bucket: 'onTime' | 'late' = diff > 3 ? 'late' : 'onTime';
      // Recorded here rather than at the top of the loop: an entry skipped above for an
      // unresolvable slot must not suppress a later write for the same visit that does resolve.
      seenVisits.add(visitKey);
      if (!map[l.who]) map[l.who] = { onTime: 0, late: 0 };
      map[l.who][bucket]++;
      tagged.push({
        pi: o.pi,
        date: dateIST,
        order: o,
        who: l.who,
        slot,
        arrivedAt: _anHhMmIST(l.d),
        diff,
        bucket,
      });
    }
  }
  return { byName: map, tagged };
}

/* ── Ratings → the job they belong to ──────────────────────────────────────
   Ported from material-depot-site's Admin.html (_anAttachAuditRatings /
   _anAttachInstallRatings), which this view's original port predates.

   Why it matters here and not before: until 2026-08-24 the rating was written
   by the field app at the moment the client signed, so "ratings whose
   created_at falls in the report window" and "jobs done in the report window"
   were the same set. Collection then moved to a COE phone call made the day
   after (or later, when a client doesn't pick up), so the two sets have come
   apart — a job finished on the last day of a month gets its score in the
   next one. Filtering ratings by their own created_at therefore drops scores
   from the period whose work they describe and lends them to the period after.

   Joining on the ORDER instead makes the rating counts a strict subset of
   that section's completed total, however late the call happened. It also
   de-duplicates: two ratings on one audit (which real data has — the CRM's
   own field app wrote on-site scores until 2026-08-24, and an auditor who
   re-signed a job card produced two rows) collapse to the latest one instead
   of both landing in NPS. */
function _anAttachAuditRatings(completedRows: any[], ratings: any[]) {
  const byOrder: Record<string, any> = {};
  const byPi: Record<string, any> = {};
  for (const r of ratings) {
    if (r.order_type !== 'audit') continue;
    // Latest write wins for a given order — a re-signed job card or a COE
    // correction supersedes the earlier score rather than joining it.
    const keep = (cur: any) => !cur || String(r.created_at || '') > String(cur.created_at || '');
    if (r.order_id) { if (keep(byOrder[r.order_id])) byOrder[r.order_id] = r; }
    else if (r.pi && keep(byPi[r.pi])) byPi[r.pi] = r; // legacy rows written before order_id existed
  }
  const map = new Map<any, any>();
  for (const o of completedRows) {
    const r = (o.id && byOrder[o.id]) || byPi[o.pi];
    if (r) map.set(o, r);
  }
  return map;
}

/* Install is the harder half: a rating's order_id is the PARENT order, shared
   by every sub-job on it, so it doesn't say which sub-job was rated. Same
   three-step disambiguation as Admin.html — assigned-installer email first,
   then nearest completion date, and the residue is left unattached rather than
   guessed. Attempts are collapsed to one row per sub-job first (see the
   orderId/sjId comment in _anInstallAttempts). */
function _anAttachInstallRatings(attempts: any[], ratings: any[]) {
  // 'partial' is in-progress and never carries a client signature, so it can't
  // have been reviewed — matching Admin.html's doneRows.
  const done = attempts.filter((a) => a.status === 'completed');
  const perSubjob = new Map<string, any>();
  for (const a of done) {
    const k = a.orderId + '|' + (a.sjId || a.type);
    const cur = perSubjob.get(k);
    if (!cur || String(a.date) > String(cur.date)) perSubjob.set(k, a);
  }
  const rowsByOrder: Record<string, any[]> = {};
  for (const a of perSubjob.values()) (rowsByOrder[a.orderId] = rowsByOrder[a.orderId] || []).push(a);

  const candsByOrder: Record<string, any[]> = {};
  for (const r of ratings) {
    if (r.order_type !== 'install') continue;
    const k = r.order_id || 'pi:' + r.pi;
    (candsByOrder[k] = candsByOrder[k] || []).push(r);
  }
  const attached = new Map<any, any>();
  for (const orderId of Object.keys(rowsByOrder)) {
    const rows = rowsByOrder[orderId];
    const cands = (candsByOrder[orderId] || candsByOrder['pi:' + rows[0].pi] || []).slice();
    if (!cands.length) continue;
    if (rows.length === 1) {
      attached.set(rows[0], cands.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]);
      continue;
    }
    for (const row of rows) {
      const emails = new Set((row.installers || []).map((a: any) => a.installer_email).filter(Boolean));
      const idx = cands.findIndex((c) => emails.has(c.staff_email));
      if (idx >= 0) attached.set(row, cands.splice(idx, 1)[0]);
    }
    for (const row of rows.filter((r) => !attached.has(r))) {
      if (!cands.length) break;
      let bestI = -1, bestDiff = Infinity;
      cands.forEach((c, i) => {
        const d = Math.abs(new Date(c.created_at).getTime() - new Date(row.date).getTime());
        if (d < bestDiff) { bestDiff = d; bestI = i; }
      });
      if (bestI >= 0) attached.set(row, cands.splice(bestI, 1)[0]);
    }
  }
  return attached;
}

/* Did the client actually sign a job card. Measured from the signature, not
   from "a rating exists" — that proxy was true only while the field app wrote
   the rating at signing time, and became wrong on 2026-08-24 when collection
   moved to a COE call the day after. Left as a proxy it would have quietly
   turned into "% of jobs the COE has got round to reviewing". */
function _anAuditSigned(o: any): boolean {
  return !!(o.signedName && String(o.signedName).trim());
}
function _anInstallSigned(att: any): boolean {
  return !!(att.sign && (att.sign.name || att.sign.img));
}

function _anInstallerMap(attempts: any[], iRatingMap: Map<any, any>, arrMap: Record<string, { onTime: number; late: number }>) {
  const map: Record<string, any> = {};
  for (const att of attempts) {
    for (const inst of att.installers) {
      const k = inst.installer_email || inst.installer_name;
      if (!k) continue;
      if (!map[k])
        map[k] = {
          name: inst.installer_name || k,
          email: inst.installer_email || '',
          orders: 0,
          completed: 0,
          wfQty: 0,
          wpRolls: 0,
          wpSqft: 0,
          q1: [] as number[],
          q2: [] as number[],
          q3: [] as number[],
        };
      map[k].orders++;
      if (['completed', 'partial'].includes(att.status)) map[k].completed++;
      for (const it of att.items) {
        const sqft = parseFloat(it.sqft) || 0;
        if (att.type === 'flooring') map[k].wfQty += sqft;
        else {
          map[k].wpSqft += sqft;
          map[k].wpRolls += sqft ? Math.ceil(sqft / SQFT_PER_ROLL) : 0;
        }
      }
    }
  }
  /* Credited through the sub-job the rating was attached to, not by matching
     rating.staff_email against this map's keys. Two reasons: a rating whose
     staff_email is blank (or names a co-installer rather than the primary)
     used to be silently dropped from everyone, and — since collection moved to
     a D+1 call — a score can arrive in a later period than the job, so keying
     off the rating alone credited it to nobody unless that installer happened
     to have another job in the window. Co-assigned installers each get the
     job's score, the same way this map already gives each of them its full
     sqft. */
  for (const [att, r] of iRatingMap) {
    for (const inst of att.installers || []) {
      const k = inst.installer_email || inst.installer_name;
      if (!k || !map[k]) continue;
      if (r.q1_score) map[k].q1.push(+r.q1_score);
      if (r.q2_score) map[k].q2.push(+r.q2_score);
      if (r.q3_score) map[k].q3.push(+r.q3_score);
    }
  }
  for (const k of Object.keys(map)) {
    const ar = arrMap[map[k].name] || { onTime: 0, late: 0 };
    map[k].arrOnTime = ar.onTime;
    map[k].arrLate = ar.late;
  }
  return Object.values(map).sort((a: any, b: any) => b.orders - a.orders);
}

function _anAuditorMap(auditFiltered: any[], aRatingMap: Map<any, any>, arrMap: Record<string, { onTime: number; late: number }>) {
  const map: Record<string, any> = {};
  for (const o of auditFiltered) {
    const k = o.auditor_email || o.auditor_name;
    if (!k) continue;
    if (!map[k]) map[k] = { name: o.auditor_name || k, email: o.auditor_email || '', orders: 0, completed: 0, q1: [] as number[], q2: [] as number[], q3: [] as number[] };
    map[k].orders++;
    if (o.status === 'completed') map[k].completed++;
  }
  // Through the audit order, for the same reason as the installer map above:
  // the order names its auditor authoritatively, the rating's staff_email is
  // only a copy of it taken at write time.
  for (const [o, r] of aRatingMap) {
    const k = o.auditor_email || o.auditor_name;
    if (!k || !map[k]) continue;
    if (r.q1_score) map[k].q1.push(+r.q1_score);
    if (r.q2_score) map[k].q2.push(+r.q2_score);
    if (r.q3_score) map[k].q3.push(+r.q3_score);
  }
  for (const k of Object.keys(map)) {
    const ar = arrMap[map[k].name] || { onTime: 0, late: 0 };
    map[k].arrOnTime = ar.onTime;
    map[k].arrLate = ar.late;
  }
  return Object.values(map).sort((a: any, b: any) => b.orders - a.orders);
}

/* ---- ANALYTICS V2 (ported from Admin.jsx lines 1158-1486) ---- */

/* The header line for a ratings drill: the bands and the NPS the tile shows, rather than a
   pass/fail ratio the rows cannot support. */
function npsSummary(rated: any[], nps: number | null): string {
  const n = rated.length;
  if (!n) return 'No ratings in this range';
  const prom = rated.filter((r) => r.q1_score >= 9).length;
  const det = rated.filter((r) => r.q1_score <= 7).length;
  return `${n} rating${n === 1 ? '' : 's'} · ${prom} ${NPS_BAND_LABELS.promoter} · ${n - prom - det} ${NPS_BAND_LABELS.neutral} · ${det} ${NPS_BAND_LABELS.detractor}${nps === null ? '' : ` · NPS ${nps >= 0 ? '+' : ''}${nps}`}`;
}

/* ── Metric drill-down ────────────────────────────────────────────────────
   `hit` is what makes a drill answer the question a percentage raises: 'yes' rows are the
   numerator, 'no' rows are the rest of the denominator, and 'na' is for a row that is genuinely
   neither (a Neutral rating, or a signature we could not read) — which must never be quietly
   folded into "no". Every list is sorted numerator-first so the split is visible without reading
   the whole table. */
type DrillHit = 'yes' | 'no' | 'na';
type DrillRow = {
  pi: string;
  customer: string;
  phone: string;
  bm: string;
  person: string;
  slot: string;
  date: string;
  result: string;
  hit: DrillHit;
};
/* `summary` overrides the computed "X of Y — Z%" header. Needed for the ratings drills, where
   yes/(yes+no) would be promoters over promoters-plus-detractors — which is not NPS and not any
   other real number. A drill whose rows are a breakdown rather than a pass/fail says so. */
type Drill = { title: string; note: string; rows: DrillRow[]; summary?: string };

interface AnalyticsData {
  installs: any[];
  audits: any[];
  ratings: any[];
  // false when the audit-signature read failed — see signOk in the loader.
  auditSignOk: boolean;
}

interface AnalyticsState {
  loading: boolean;
  error: boolean;
  data: AnalyticsData | null;
}

/* The EXECUTION half: site audits and installations straight off the ops DB (Supabase). Rendered
   as the Execution tab of the shell at the bottom of this file. */
function ExecutionAnalyticsView({ city = 'all' }: { city?: CityFilter }) {
  const [analyticsFrom, setAnalyticsFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 6);
    return _anDstr(t);
  });
  const [analyticsTo, setAnalyticsTo] = useState(() => _anDstr(new Date()));

  const [state, setState] = useState<AnalyticsState>({ loading: true, error: false, data: null });
  /* The bookings/TAT charts are drawn by the shared analytics module (see catAnalytics.ts) so both
     halves of this page look like one dashboard. Loaded in the background and rendered only once
     it arrives — the ops metrics below must never wait on it, and a failed load costs those two
     sections rather than the tab. */
  const [chartApi, setChartApi] = useState<CatAnalyticsApi | null>(() => catAnalyticsIfLoaded());
  useEffect(() => {
    if (chartApi) return;
    let alive = true;
    loadCatAnalytics()
      .then((m) => alive && setChartApi(m))
      .catch(() => {
        /* charts stay hidden; every ops number on this tab is unaffected */
      });
    return () => {
      alive = false;
    };
  }, [chartApi]);
  const [tempFrom, setTempFrom] = useState(analyticsFrom);
  const [tempTo, setTempTo] = useState(analyticsTo);
  useEffect(() => {
    setTempFrom(analyticsFrom);
    setTempTo(analyticsTo);
  }, [analyticsFrom, analyticsTo]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let installRes: any, auditRes: any, ratingsRes: any;
      try {
        [installRes, auditRes, ratingsRes] = await Promise.all([
          /* customer_name/bm/phone are for the metric drill-downs — a list of enquiry IDs does not
             answer "which orders", which is the whole point of opening one. All three are columns on
             the slim view, so this costs no extra query (and note the column is `customer_name`;
             `name` does not exist on this table — see CLAUDE.md). `phone` is re-read with the log
             below for orders from 1 Jul 2026, which is the copy the audit phone-match uses. */
          sbGetLong('install_orders_slim?select=id,pi,status,subjobs,service,delivery_date,created_at,city,customer_name,bm,phone&status=neq.deleted'),
          sbGetLong(
            'audit_orders?select=id,pi,status,date,slot,auditor_name,auditor_email,phone,log,created_at,city&status=not.in.(deleted,slot_reserved,slot_converted)'
          ),
          // order_id is what joins a rating to the job it describes; without it
          // the only option is the rating's own created_at, which stopped
          // tracking the job date when collection moved to a D+1 COE call.
          sbGetLong('ratings?select=order_type,order_id,pi,q1_score,q2_score,q3_score,created_at,staff_name,staff_email'),
        ]);
      } catch (e) {
        if (alive) setState({ loading: false, error: true, data: null });
        return;
      }
      // City scope (header toggle) — applied to the two order sets before any
      // metric is computed, so every tile/chart below reflects the choice.
      if (Array.isArray(installRes)) installRes = inCity(installRes, city);
      if (Array.isArray(auditRes)) auditRes = inCity(auditRes, city);
      // delivMeta and installLogRes are independent enrichments of installRes —
      // neither depends on the other's result, so fetch them concurrently
      // instead of one-after-another (saves one full network round-trip).
      /* Audit signatures come as their own query, scoped to completed rows.
         `audit_ticked->sign->>name` is a cheap json path to TRANSFER but not
         to READ: audit_ticked also holds the job-card room photos, so Postgres
         detoasts the whole blob per row and the same select over all ~1.1k
         audits dies on the statement timeout (measured: 500
         "canceling statement due to statement timeout"). Restricted to the 306
         completed rows — the only ones the metric's denominator counts — it
         returns in ~3s. */
      const [ratingsFallback, delivMeta, installLogRes, signMeta] = await Promise.all([
        Array.isArray(ratingsRes)
          ? Promise.resolve(ratingsRes)
          : sbGetLong('ratings?select=order_type,order_id,pi,q1_score,q2_score,created_at,staff_name,staff_email').catch(() => []),
        sbGetLong('install_orders?select=pi,original_delivery_date&status=neq.deleted').catch(() => []),
        sbGetLong('install_orders?select=pi,phone,log&status=neq.deleted&created_at=gte.2026-07-01').catch(() => []),
        /* Unpaged again: this timed out while audit_ticked held base64 job-card images (70 MB
           over the column, single rows past 8 MB). Those were moved to storage, the column is
           now ~1.3 MB, and this reads in ~0.3s. sbGetPaged remains available if it ever regresses. */
        sbGetLong('audit_orders?select=id,signedName:audit_ticked->sign->>name&status=eq.completed').catch(() => null),
      ]);
      ratingsRes = ratingsFallback;
      /* `ratings` has no city of its own — it's scoped through the order it
         belongs to. Keyed on order_id first (exact, and the same key the
         attach helpers join on), falling back to pi only for legacy rows
         written before that column existed; pi alone was unreliable here
         because a rating's pi is free text and some test rows carry junk
         like "x". Without this, NPS/ratings/job-card % would keep reporting
         both cities while every other tile respects the toggle. Applied after
         the fallback re-fetch so a first-attempt timeout can't slip an
         unfiltered set through. */
      if (city !== 'all' && Array.isArray(ratingsRes)) {
        const iRows = Array.isArray(installRes) ? installRes : [];
        const aRows = Array.isArray(auditRes) ? auditRes : [];
        const iIds = new Set(iRows.map((o: any) => String(o.id)));
        const aIds = new Set(aRows.map((o: any) => String(o.id)));
        const iPis = new Set(iRows.map((o: any) => o.pi));
        const aPis = new Set(aRows.map((o: any) => o.pi));
        ratingsRes = ratingsRes.filter((r: any) => {
          if (r.order_type === 'install') return r.order_id ? iIds.has(String(r.order_id)) : iPis.has(r.pi);
          if (r.order_type === 'audit') return r.order_id ? aIds.has(String(r.order_id)) : aPis.has(r.pi);
          return false;
        });
      }
      /* A failed signature read must NOT read as "nobody signed" — that would
         render a confident 0% instead of an honest "—". Tracked separately so
         the card can say which it is (house style: distinguish couldn't-load
         from genuinely-none). */
      const signOk = Array.isArray(signMeta);
      if (signOk && Array.isArray(auditRes)) {
        const sm: Record<string, string | null> = {};
        for (const r of signMeta as any[]) sm[r.id] = r.signedName || null;
        for (const o of auditRes) o.signedName = sm[o.id] || null;
      }
      if (Array.isArray(installRes) && Array.isArray(delivMeta)) {
        const dm: Record<string, any> = {};
        for (const r of delivMeta) dm[r.pi] = r.original_delivery_date || null;
        for (const o of installRes) o.original_delivery_date = dm[o.pi] || null;
      }
      if (Array.isArray(installLogRes) && Array.isArray(installRes)) {
        const lm: Record<string, any> = {};
        for (const r of installLogRes) lm[r.pi] = { phone: r.phone || null, log: r.log || [] };
        for (const o of installRes) {
          // Keep the phone from the main select when this order predates the log window, instead of
          // blanking it — a blank phone can never match a site audit and would read as "no audit".
          o.phone = lm[o.pi]?.phone ?? o.phone ?? null;
          o.log = lm[o.pi]?.log || [];
        }
      }
      if (!alive) return;
      setState({
        loading: false,
        error: false,
        data: {
          installs: Array.isArray(installRes) ? installRes : [],
          audits: Array.isArray(auditRes) ? auditRes : [],
          ratings: Array.isArray(ratingsRes) ? ratingsRes : [],
          auditSignOk: signOk,
        },
      });
    })();
    return () => {
      alive = false;
    };
  }, [city]);

  if (state.loading)
    return <div className="text-center py-8 text-[13px] text-gray-400">Loading…</div>;
  if (state.error)
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-[13px] font-semibold text-red-600">
        ⚠ Failed to load operations data — network timeout. Please try again.
      </div>
    );

  return (
    <AnalyticsBody
      data={state.data as AnalyticsData}
      chartApi={chartApi}
      from={analyticsFrom}
      to={analyticsTo}
      tempFrom={tempFrom}
      tempTo={tempTo}
      setTempFrom={setTempFrom}
      setTempTo={setTempTo}
      setAnalyticsFrom={setAnalyticsFrom}
      setAnalyticsTo={setAnalyticsTo}
    />
  );
}

function AnalyticsBody({
  data,
  chartApi,
  from,
  to,
  tempFrom,
  tempTo,
  setTempFrom,
  setTempTo,
  setAnalyticsFrom,
  setAnalyticsTo,
}: {
  data: AnalyticsData;
  chartApi: CatAnalyticsApi | null;
  from: string;
  to: string;
  tempFrom: string;
  tempTo: string;
  setTempFrom: (v: string) => void;
  setTempTo: (v: string) => void;
  setAnalyticsFrom: (v: string) => void;
  setAnalyticsTo: (v: string) => void;
}) {
  const M = useMemo(() => {
    const { installs, audits, ratings, auditSignOk } = data;
    const todayStr = _anDstr(new Date());
    const TRACK_FROM = '2026-07-02';

    const iAttempts = _anInstallAttempts(installs, from, to);
    const iTotal = iAttempts.length;
    const aFiltered = audits.filter((o) => o.date && o.date >= from && o.date <= to);
    const aTotal = aFiltered.length;

    /* Ratings are attached to the jobs in range, NOT filtered by their own
       created_at — see _anAttachAuditRatings. Consequences worth knowing when
       reading these tiles: the rating count can only ever be a subset of that
       section's completed total, a score always lands in the period of the job
       it describes however late the COE's call was, and the last few days of
       the range legitimately show fewer scores than jobs because their D+1
       calls haven't happened yet. */
    const aRatingMap = _anAttachAuditRatings(aFiltered.filter((o) => o.status === 'completed'), ratings);
    const iRatingMap = _anAttachInstallRatings(iAttempts, ratings);
    const AR = [...aRatingMap.values()];
    const IR = [...iRatingMap.values()];

    const iCompleted = iAttempts.filter((a) => ['completed', 'partial'].includes(a.status)).length;
    const iDelayed = iAttempts.filter((a) => a.logDelay).length;
    const auditPhones = new Set(audits.map((o) => o.phone).filter(Boolean));
    const iUniquePIs = new Set(iAttempts.map((a) => a.pi));
    const iMDaudit = [...iUniquePIs].filter((pi) => {
      const o = installs.find((r) => r.pi === pi);
      return o && o.phone && auditPhones.has(o.phone);
    }).length;
    // Signature-based, not rating-based — see _anInstallSigned.
    const iJobCard = iAttempts.filter((a) => ['completed', 'partial'].includes(a.status) && _anInstallSigned(a)).length;
    const avgA = (arr: any[], k: string) => avgScore(arr.map((r) => r[k]));
    const IR_q1 = avgA(IR, 'q1_score'),
      IR_q2 = avgA(IR, 'q2_score'),
      IR_q3 = avgA(IR, 'q3_score');
    // npsFrom is the single house definition of the bands, shared with the
    // COE's own Review scores tab so the two can never drift apart.
    const IR_nps_s = npsFrom(IR.map((r) => r.q1_score));
    const IR_prom = IR_nps_s.prom, IR_det = IR_nps_s.det, IR_nps = IR_nps_s.nps;

    const aCompleted = aFiltered.filter((o) => o.status === 'completed').length;
    const aJobCard = aFiltered.filter((o) => o.status === 'completed' && _anAuditSigned(o)).length;
    // Surfaced so the tile can render "—" rather than a false 0%.
    const aSignKnown = auditSignOk;
    const aRescheduled = aFiltered.filter((o) => o.status === 'reschedule').length;
    const AR_q1 = avgA(AR, 'q1_score'),
      AR_q2 = avgA(AR, 'q2_score'),
      AR_q3 = avgA(AR, 'q3_score');
    const AR_nps_s = npsFrom(AR.map((r) => r.q1_score));
    const AR_prom = AR_nps_s.prom, AR_det = AR_nps_s.det, AR_nps = AR_nps_s.nps;

    const iTrackFrom = from > TRACK_FROM ? from : TRACK_FROM;
    const aTrackFrom = from > TRACK_FROM ? from : TRACK_FROM;
    const iArr = _anArrivalStats(installs, iTrackFrom, to, true);
    const aArr = _anArrivalStats(audits, aTrackFrom, to, false);
    const sumArr = (map: Record<string, { onTime: number; late: number }>) =>
      Object.values(map).reduce((s, v) => ({ onTime: s.onTime + v.onTime, late: s.late + v.late }), { onTime: 0, late: 0 });
    const iArrTot = sumArr(iArr.byName),
      aArrTot = sumArr(aArr.byName);

    const installers = _anInstallerMap(iAttempts, iRatingMap, iArr.byName);
    const auditors = _anAuditorMap(aFiltered, aRatingMap, aArr.byName);

    const origTracked = iAttempts.filter((a) => a.originalDelivery).length;
    const confirmedDelayed = iAttempts.filter((a) => a.hasDelay).length;

    const naCount = installs.filter((o) => {
      if (['pending', 'deliv_delayed'].includes(o.status) && o.delivery_date && o.delivery_date <= todayStr) return true;
      if ((o.subjobs || []).some((sj: any) => sj.status === 'reschedule')) return true;
      if (o.service && o.service.follow_up_date && o.service.follow_up_date <= todayStr) return true;
      return false;
    }).length;

    const iByStatus: Record<string, number> = {};
    iAttempts.forEach((a) => {
      iByStatus[a.status] = (iByStatus[a.status] || 0) + 1;
    });

    /* ── BOOKINGS vs EXECUTIONS, and the turnaround between them ──────────────────────────
       A booking and its execution are two different days and belong on two different dates:
       someone who buys a ₹999 site audit today for the day after tomorrow is a BOOKING today and
       an EXECUTION the day after tomorrow. Same for an installation — the order is placed on one
       day and the installers turn up on another. So, per bucket in the selected range:
         • bookings   = orders CREATED in the bucket (install: once per parent ORDER, not per
                        sub-job, since one order books once however many sub-jobs it carries)
         • executions = work actually DONE in the bucket (audit: the "Site audit completed" log
                        date, falling back to the scheduled date · install: one row per completed
                        sub-job, so an order with a wallpaper and a flooring sub-job books once
                        and executes twice)
         • TAT        = execution date − booking date, in days, per executed row
       These are never added together and never share an axis trick: same unit (jobs) on one axis,
       which is exactly when a grouped column chart is honest. Booking counts here are NOT
       comparable with the Category tab's order counts — this side counts ops rows in Supabase,
       that side counts order lines in the order book. */
    // Some live log rows carry a `d` that Date() cannot parse (258 such entries in audit_orders
    // on 2026-08-18); _anDateIST would throw RangeError and blank the whole tab, so every date
    // derived from log/DB text goes through this guard first.
    const dateSafe = (iso: any): string | null => {
      if (!iso) return null;
      const t = new Date(iso);
      return isNaN(t.getTime()) ? null : _anDateIST(iso);
    };
    const dayDiff = (a: string | null, b: string | null) => (!a || !b ? null : Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000));
    const aExecDate = (o: any): string | null => {
      let cd: string | null = null;
      for (const l of o.log || []) {
        if (!l.t || !l.d || !/site audit completed/i.test(l.t)) continue;
        const d = dateSafe(l.d);
        if (d && (!cd || d > cd)) cd = d;
      }
      return cd || o.date || null;
    };
    const inRange = (d: string | null) => !!d && d >= from && d <= to;

    const aBookings = audits.map((o) => ({ date: dateSafe(o.created_at) })).filter((x) => inRange(x.date));
    const aExecs = audits
      .filter((o) => o.status === 'completed')
      .map((o) => ({ o, date: aExecDate(o) }))
      .filter((x) => inRange(x.date));
    const aTats = aExecs.map((x) => dayDiff(x.date, dateSafe(x.o.created_at)));

    const iBookings = installs.map((o) => ({ date: dateSafe(o.created_at) })).filter((x) => inRange(x.date));
    /* One execution per completed SUB-JOB, not per attempt row. _anInstallAttempts emits a row
       per scheduled date, so a two-day sub-job would otherwise execute twice — collapse on
       order+sub-job and keep the latest date, which is the completion date for anything with a
       completion log. */
    const iExecMap = new Map<string, string>();
    for (const a of iAttempts) {
      if (!['completed', 'partial'].includes(a.status)) continue;
      const k = a.orderId + '|' + a.sjId;
      const prev = iExecMap.get(k);
      if (!prev || a.date > prev) iExecMap.set(k, a.date);
    }
    const iExecs = [...iExecMap.entries()].map(([k, date]) => ({ date, orderId: k.split('|')[0] }));
    const iTats = iExecs.map((r) => {
      const o = installs.find((x) => String(x.id) === r.orderId);
      return dayDiff(r.date, o ? dateSafe(o.created_at) : null);
    });

    /* ══ METRIC DRILL-DOWNS ═══════════════════════════════════════════════════════════════
       Every tile on this tab is clickable and opens the rows behind it, split into the ones that
       met the criterion and the ones that did not — the question a percentage always raises next
       ("which 5 of the 7 arrived on time, and who were the 2 that didn't?").

       The rule that keeps this honest: a drill's row set IS the tile's denominator, built from the
       same variable the tile renders. So `iStatus:*` and the delivery tiles iterate `iAttempts`
       (attempts, matching "total attempts in range"), Job Card iterates only the completed/partial
       attempts, MD Audit iterates distinct PIs, the ratings drills iterate the rating map, and the
       arrival drills iterate the arrival rows tagged in _anArrivalStats. Adding a tile means
       adding its drill off the same variable — never off a fresh filter that happens to look right.

       No extra queries: customer/phone/BM/assignee all come off the order objects already loaded. */
    const label = (st: string) => JOB_STATUS[st]?.l || st;
    const oRow = (o: any) => ({ customer: o?.customer_name || '', phone: o?.phone || '', bm: o?.bm || '' });
    const attemptPerson = (a: any) =>
      (a.installers || [])
        .map((x: any) => x.installer_name)
        .filter(Boolean)
        .join(', ');
    const mk = (title: string, note: string, rows: DrillRow[], summary?: string): Drill => ({ title, note, rows, summary });

    const iCompletedAttempts = iAttempts.filter((a) => ['completed', 'partial'].includes(a.status));

    const ratingResult = (r: any) => {
      const band = r.q1_score >= 9 ? '✓ Promoter' : r.q1_score <= 7 ? '✗ Detractor' : '● Neutral';
      return band + ' — Q1 ' + r.q1_score + ' · Q2 ' + (r.q2_score ?? '—') + ' · Q3 ' + (r.q3_score ?? '—');
    };
    const arrRows = (tagged: typeof iArr.tagged): DrillRow[] =>
      tagged.map((t) => ({
        pi: t.pi,
        ...oRow(t.order),
        person: t.who,
        slot: t.slot + ' → arrived ' + t.arrivedAt,
        date: t.date,
        hit: t.bucket === 'onTime' ? 'yes' : 'no',
        result:
          t.bucket === 'onTime'
            ? '✓ On time' + (t.diff > 0 ? ' (' + t.diff + ' min after slot)' : t.diff < 0 ? ' (' + -t.diff + ' min early)' : ' (on the minute)')
            : '✗ Late by ' + t.diff + ' min',
      }));

    const drills: Record<string, Drill> = {
      /* ---- Site Installation ---- */
      iArrival: mk(
        'Site Installation — Installer Arrival On Time %',
        'One row per logged "arrived at site" entry on/after 2 Jul 2026 (when arrival tracking began) whose booked slot could be resolved. A sub-job visited by two installers shows one row each, and a reassigned sub-job can appear once per installer who actually turned up. More than 3 minutes past the slot counts as late.',
        arrRows(iArr.tagged)
      ),
      iMDaudit: mk(
        'Site Installation — Material Depot Audit %',
        'One row per distinct install order in range, phone-matched against every site audit order we hold (any date). A blank phone can never match — that is a data gap, not a "no".',
        [...iUniquePIs].map((pi) => {
          const o = installs.find((r) => r.pi === pi);
          const matched = !!(o && o.phone && auditPhones.has(o.phone));
          return {
            pi: String(pi),
            ...oRow(o),
            person: '',
            slot: '',
            date: (iAttempts.find((a) => a.pi === pi) || {}).date || '',
            hit: matched ? 'yes' : 'no',
            result: matched ? '✓ Matched a Material Depot site audit' : o && !o.phone ? '✗ No match — this order has no phone number' : '✗ No matching site audit',
          } as DrillRow;
        })
      ),
      iJobCard: mk(
        'Site Installation — Job Card & Signature %',
        'Every completed or partially completed attempt in range. Measured from the client signature on the job card itself (subjobs[].jobcard.sign), not from "a rating exists" — that proxy stopped being true on 24 Aug 2026, when review scores moved to a Category Ops call the day after.',
        iCompletedAttempts.map((a) => ({
          pi: a.pi,
          ...oRow(a.order),
          person: attemptPerson(a),
          slot: a.slot || '',
          date: a.date,
          hit: _anInstallSigned(a) ? 'yes' : 'no',
          result: _anInstallSigned(a) ? '✓ Signed job card' : '✗ No signature on the job card',
        }))
      ),
      iRatings: mk(
        'Site Installation — Client Ratings, NPS and Q1–Q3',
        'Every attempt in range that has a client rating attached — the set behind the NPS and Q1/Q2/Q3 tiles. ' +
          NPS_HOUSE_NOTE +
          ' A rating is joined to the job it describes rather than filtered by its own date, so the last few days of any range legitimately show fewer scores than jobs: those D+1 calls have not been made yet.',
        [...iRatingMap.entries()].map(([a, r]: any) => ({
          pi: a.pi,
          ...oRow(a.order),
          person: attemptPerson(a),
          slot: a.slot || '',
          date: a.date,
          hit: r.q1_score >= 9 ? 'yes' : r.q1_score <= 7 ? 'no' : 'na',
          result: ratingResult(r),
        })),
        npsSummary(IR, IR_nps)
      ),
      iDelayLog: mk(
        'Site Installation — Delay mentioned in log',
        'Every attempt in range. Counted when any log entry on the parent order mentions "delay" — free-text, so it catches an SM noting a delay even where no date changed.',
        iAttempts.map((a) => ({
          pi: a.pi,
          ...oRow(a.order),
          person: attemptPerson(a),
          slot: a.slot || '',
          date: a.date,
          hit: a.logDelay ? 'yes' : 'no',
          result: a.logDelay ? '✓ Delay mentioned in the log' : '✗ No delay mentioned',
        }))
      ),
      iOrigTracked: mk(
        'Site Installation — With original delivery date tracked',
        'Every attempt in range. original_delivery_date is only set on orders created from 2 Jul 2026, so an older order reads as untracked rather than as on time.',
        iAttempts.map((a) => ({
          pi: a.pi,
          ...oRow(a.order),
          person: attemptPerson(a),
          slot: a.slot || '',
          date: a.date,
          hit: a.originalDelivery ? 'yes' : 'no',
          result: a.originalDelivery ? '✓ Original date tracked: ' + a.originalDelivery + (a.currentDelivery ? ' → now ' + a.currentDelivery : '') : '✗ No original delivery date on record',
        }))
      ),
      iConfirmedDelayed: mk(
        'Site Installation — Confirmed delayed (delivery date changed)',
        'Every attempt in range. "Confirmed" compares original_delivery_date against the current delivery_date, so it is a measured change rather than a mention in free text.',
        iAttempts.map((a) => ({
          pi: a.pi,
          ...oRow(a.order),
          person: attemptPerson(a),
          slot: a.slot || '',
          date: a.date,
          hit: a.hasDelay ? 'yes' : 'no',
          result: a.hasDelay ? '✓ Delivery moved ' + a.originalDelivery + ' → ' + a.currentDelivery : a.originalDelivery ? '✗ Delivery date unchanged (' + a.originalDelivery + ')' : '✗ Not tracked — no original delivery date',
        }))
      ),
      iNeedAction: mk(
        'Site Installation — Orders needing SM attention right now',
        'A LIVE count across every non-deleted install order, deliberately NOT filtered by the date range above — an overdue order does not stop being overdue because you narrowed the report. Flagged when delivery is due/overdue while still pending, or a sub-job sits in reschedule, or an ops follow-up date has passed.',
        installs.map((o) => {
          const dueDeliv = ['pending', 'deliv_delayed'].includes(o.status) && o.delivery_date && o.delivery_date <= todayStr;
          const resched = (o.subjobs || []).some((sj: any) => sj.status === 'reschedule');
          const followUp = o.service && o.service.follow_up_date && o.service.follow_up_date <= todayStr;
          const why = [dueDeliv ? 'delivery due ' + o.delivery_date : '', resched ? 'sub-job in reschedule' : '', followUp ? 'follow-up due ' + o.service.follow_up_date : ''].filter(Boolean);
          return {
            pi: o.pi,
            ...oRow(o),
            person: '',
            slot: '',
            date: o.delivery_date || '',
            hit: why.length ? 'yes' : 'no',
            result: why.length ? '✓ ' + why.join(' · ') : '✗ Nothing outstanding',
          } as DrillRow;
        })
      ),

      /* ---- Site Audit ---- */
      aArrival: mk(
        'Site Audit — Auditor Arrival On Time %',
        'One row per logged "arrived at site" entry on/after 2 Jul 2026 (when arrival tracking began) whose booked slot could be resolved. More than 3 minutes past the slot counts as late.',
        arrRows(aArr.tagged)
      ),
      aJobCard: mk(
        'Site Audit — Job Card & Signature %',
        auditSignOk
          ? 'Every completed audit in range, measured from the client signature on the job card (audit_ticked.sign).'
          : 'The signature read failed for this range, so no row can be judged — this is "could not load", not "nobody signed".',
        aFiltered
          .filter((o) => o.status === 'completed')
          .map((o) => ({
            pi: o.pi,
            ...oRow(o),
            person: o.auditor_name || '',
            slot: o.slot || '',
            date: o.date,
            hit: !auditSignOk ? 'na' : _anAuditSigned(o) ? 'yes' : 'no',
            result: !auditSignOk ? '— Signature could not be read' : _anAuditSigned(o) ? '✓ Signed job card' : '✗ No signature on the job card',
          }))
      ),
      aCompletion: mk('Site Audit — Completion Rate %', 'Every audit scheduled in this date range, whatever its current status.', aFiltered.map((o) => ({
        pi: o.pi,
        ...oRow(o),
        person: o.auditor_name || '',
        slot: o.slot || '',
        date: o.date,
        hit: o.status === 'completed' ? 'yes' : 'no',
        result: o.status === 'completed' ? '✓ Completed' : '✗ Not completed (' + label(o.status) + ')',
      }))),
      aReschedule: mk('Site Audit — Reschedule Rate %', 'Every audit scheduled in this date range. Counts audits sitting in reschedule status right now, not every audit that was ever moved.', aFiltered.map((o) => ({
        pi: o.pi,
        ...oRow(o),
        person: o.auditor_name || '',
        slot: o.slot || '',
        date: o.date,
        hit: o.status === 'reschedule' ? 'yes' : 'no',
        result: o.status === 'reschedule' ? '✓ In reschedule status' : '✗ Not in reschedule (' + label(o.status) + ')',
      }))),
      aRatings: mk(
        'Site Audit — Client Ratings, NPS and Q1–Q3',
        'Every audit in range that has a client rating attached — the set behind the NPS and Q1/Q2/Q3 tiles. ' + NPS_HOUSE_NOTE,
        [...aRatingMap.entries()].map(([o, r]: any) => ({
          pi: o.pi,
          ...oRow(o),
          person: o.auditor_name || '',
          slot: o.slot || '',
          date: o.date,
          hit: r.q1_score >= 9 ? 'yes' : r.q1_score <= 7 ? 'no' : 'na',
          result: ratingResult(r),
        })),
        npsSummary(AR, AR_nps)
      ),
    };

    /* One drill per status tile, over the same attempt set the tile's percentage divides by. */
    for (const st of Object.keys(iByStatus)) {
      drills['iStatus:' + st] = mk(
        'Site Installation — ' + label(st),
        'Every attempt in range. An attempt is one sub-job on one scheduled date, so a rescheduled sub-job appears once per date that falls inside the range — the same counting rule as "total attempts" above.',
        iAttempts.map((a) => ({
          pi: a.pi,
          ...oRow(a.order),
          person: attemptPerson(a),
          slot: a.slot || '',
          date: a.date,
          hit: a.status === st ? 'yes' : 'no',
          result: (a.status === st ? '✓ ' : '✗ ') + label(a.status),
        }))
      );
    }
    /* "No delay mentioned" is the same row set as iDelayLog with the verdict inverted, so it is
       derived from it rather than rebuilt — the two tiles can never then disagree. */
    drills.iNoDelayLog = mk('Site Installation — No delay mentioned in log', drills.iDelayLog.note, drills.iDelayLog.rows.map((r) => ({
      ...r,
      hit: r.hit === 'yes' ? 'no' : 'yes',
      result: r.hit === 'yes' ? '✗ Delay mentioned in the log' : '✓ No delay mentioned',
    })));

    return {
      drills,
      aBookings,
      aExecs,
      aTats,
      iBookings,
      iExecs,
      iTats,
      iTotal,
      aTotal,
      IR,
      AR,
      iCompleted,
      iDelayed,
      iMDaudit,
      iUniquePIs,
      iJobCard,
      IR_q1,
      IR_q2,
      IR_q3,
      IR_prom,
      IR_det,
      IR_nps,
      aCompleted,
      aJobCard,
      aRescheduled,
      aSignKnown,
      AR_q1,
      AR_q2,
      AR_q3,
      AR_prom,
      AR_det,
      AR_nps,
      iArrTot,
      aArrTot,
      installers,
      auditors,
      origTracked,
      confirmedDelayed,
      naCount,
      iByStatus,
    };
  }, [data, from, to]);

  const pc = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
  const pcColorClass = (p: number | null) => (p === null ? 'text-gray-400' : p >= 80 ? 'text-green-600' : p >= 50 ? 'text-amber-600' : 'text-red-600');
  const pcBarClass = (p: number | null) => (p === null ? 'bg-gray-300' : p >= 80 ? 'bg-green-600' : p >= 50 ? 'bg-amber-600' : 'bg-red-600');

  /* Every tile opens the rows behind it. `tile()` returns the props that make one clickable, so a
     tile with no drill registered stays inert rather than looking clickable and doing nothing. */
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const openDrill = M.drills[drillKey || ''] || null;
  const tile = (key?: string) => {
    const d = key ? M.drills[key] : null;
    if (!d) return {};
    return {
      onClick: () => setDrillKey(key as string),
      role: 'button' as const,
      tabIndex: 0,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDrillKey(key as string);
        }
      },
      title: 'Show the ' + d.rows.length + ' row(s) behind this number',
      className: 'cursor-pointer transition hover:border-gray-400 hover:shadow-sm',
    };
  };
  // Merges the clickable props into a tile's own className rather than letting one clobber the other.
  const tileProps = (key: string | undefined, base: string) => {
    const t = tile(key) as any;
    return { ...t, className: base + (t.className ? ' ' + t.className : '') };
  };

  function PctCard({ label, n, d, sub, note, drill }: { label: string; n: number; d: number; sub?: string; note?: string; drill?: string }) {
    const p = pc(n, d);
    return (
      <div {...tileProps(drill, 'rounded-lg border border-gray-200 bg-white p-4')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className={`mt-1 font-mono text-[22px] font-bold ${pcColorClass(p)}`}>{p !== null ? p + '%' : '—'}</div>
        {p !== null ? (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className={`h-full rounded-full ${pcBarClass(p)}`} style={{ width: p + '%' }}></div>
          </div>
        ) : null}
        <div className="text-[11px] text-gray-400 mt-1">{d > 0 ? n + ' of ' + d : 'No data'}</div>
        {sub ? <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div> : null}
        {note ? <div className="text-[11px] text-amber-600 mt-0.5">{note}</div> : null}
      </div>
    );
  }
  function RatingCard({ label, avg, cnt, drill }: { label: string; avg: number | null; cnt: number; drill?: string }) {
    if (avg === null)
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
          <div className="mt-1 font-mono text-[22px] font-bold text-gray-400">—</div>
          <div className="text-[11px] text-gray-400 mt-1">No ratings yet</div>
        </div>
      );
    const c = avg >= 8 ? 'text-green-600' : avg >= 6 ? 'text-amber-600' : 'text-red-600';
    const s = Math.min(5, Math.round(avg / 2));
    return (
      <div {...tileProps(drill, 'rounded-lg border border-gray-200 bg-white p-4')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>
          {avg}
          <span className="text-sm text-gray-400">/10</span>
        </div>
        <div className="text-amber-500 text-sm mt-0.5">{'★'.repeat(s) + '☆'.repeat(5 - s)}</div>
        <div className="text-[11px] text-gray-400 mt-1">
          {cnt} rating{cnt !== 1 ? 's' : ''} · in range
        </div>
      </div>
    );
  }
  function NpsCard({ label, nps, prom, det, total, drill }: { label: string; nps: number | null; prom: number; det: number; total: number; drill?: string }) {
    if (nps === null)
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
          <div className="mt-1 font-mono text-[22px] font-bold text-gray-400">—</div>
          <div className="text-[11px] text-gray-400 mt-1">No ratings yet</div>
        </div>
      );
    const c = nps >= 50 ? 'text-green-600' : nps >= 0 ? 'text-amber-600' : 'text-red-600';
    const pass = total - prom - det;
    return (
      <div {...tileProps(drill, 'rounded-lg border border-gray-200 bg-white p-4')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>
          {nps >= 0 ? '+' : ''}
          {nps}
        </div>
        <div className="flex flex-col gap-0.5 mt-1.5 text-[11px]">
          <span className="text-green-600">▲ {total ? Math.round((prom / total) * 100) : 0}% {NPS_BAND_LABELS.promoter}</span>
          <span className="text-gray-500">● {total ? Math.round((pass / total) * 100) : 0}% {NPS_BAND_LABELS.neutral}</span>
          <span className="text-red-600">▼ {total ? Math.round((det / total) * 100) : 0}% {NPS_BAND_LABELS.detractor}</span>
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          {total} rating{total !== 1 ? 's' : ''} · in range
        </div>
      </div>
    );
  }
  function ArrCell({ onTime, late }: { onTime: number; late: number }) {
    const tot = onTime + late;
    if (!tot) return <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400 text-[11px]">N/T</td>;
    const p = Math.round((onTime / tot) * 100);
    const c = pcColorClass(p);
    return (
      <td className={`px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold ${c}`}>
        {p}%<span className="text-[10px] text-gray-400 font-normal"> ({tot})</span>
      </td>
    );
  }
  function RatingCell({ arr }: { arr: number[] }) {
    if (!arr || !arr.length) return <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400">—</td>;
    const avg = +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
    const c = avg >= 8 ? 'text-green-600' : avg >= 6 ? 'text-amber-600' : 'text-red-600';
    return <td className={`px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold ${c}`}>{avg}</td>;
  }

  const iArrNote = M.iArrTot.onTime + M.iArrTot.late === 0 ? 'Tracking started 2 Jul 2026' : '';
  const aArrNote = M.aArrTot.onTime + M.aArrTot.late === 0 ? 'Tracking started 2 Jul 2026' : '';
  const statusDefs = [
    { k: 'completed', l: 'Completed', c: 'text-green-600' },
    { k: 'partial', l: 'Partially Completed', c: 'text-teal-600' },
    { k: 'onway', l: 'On The Way', c: 'text-blue-600' },
    { k: 'atsite', l: 'At Site', c: 'text-blue-600' },
    { k: 'reschedule', l: 'Rescheduled', c: 'text-red-600' },
    { k: 'callpending', l: 'Call Pending', c: 'text-amber-600' },
    { k: 'assigned', l: 'Assigned', c: 'text-amber-600' },
    { k: 'scheduled', l: 'Scheduled', c: 'text-gray-400' },
  ];

  function shortcut(days: number) {
    const t = new Date();
    const nt = _anDstr(t);
    t.setDate(t.getDate() - days);
    setAnalyticsFrom(_anDstr(t));
    setAnalyticsTo(nt);
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-gray-500 leading-relaxed">
        Operational metrics, straight off the ops database. Each scheduling attempt counted separately — a rescheduled order appears twice if both dates fall in
        the range. Not comparable with the commercial tabs, which count order lines in the order book rather than site visits.
        <br />
        <b>Click any tile</b> to see the orders behind the number — which ones met the criterion, which ones did not, and who they were assigned to.
      </p>

      {openDrill ? <DrillModal drill={openDrill} onClose={() => setDrillKey(null)} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-500 font-semibold">Date range</span>
        <input
          type="date"
          className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[13px]"
          value={tempFrom}
          onChange={(e) => setTempFrom(e.target.value)}
        />
        <span className="text-gray-400 text-[13px] px-0.5">to</span>
        <input
          type="date"
          className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[13px]"
          value={tempTo}
          onChange={(e) => setTempTo(e.target.value)}
        />
        <button
          className="bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90"
          onClick={() => {
            setAnalyticsFrom(tempFrom);
            setAnalyticsTo(tempTo);
          }}
        >
          Apply
        </button>
        <button className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:border-gray-400" onClick={() => shortcut(6)}>
          Last 7 days
        </button>
        <button className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:border-gray-400" onClick={() => shortcut(29)}>
          Last 30 days
        </button>
        <button className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:border-gray-400" onClick={() => shortcut(89)}>
          Last 90 days
        </button>
      </div>

      {/* ══ SITE INSTALLATION ══ */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3.5 px-4 sm:px-6 py-4 border-b border-gray-100">
          <span className="text-2xl flex-none">🔧</span>
          <div className="flex-1">
            <div className="text-base font-bold text-black">Site Installation</div>
            <div className="text-[12px] text-gray-400 mt-0.5">
              Per scheduling attempt · {from} to {to}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold text-black">{M.iTotal}</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Total Attempts in Range</div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Overview</div>
        <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-gray-100">
          <PctCard label="Installer Arrival On Time %" n={M.iArrTot.onTime} d={M.iArrTot.onTime + M.iArrTot.late} sub="> 3 min past slot = delayed" note={iArrNote} drill="iArrival" />
          <PctCard
            label="Material Depot Audit %"
            n={M.iMDaudit}
            d={M.iUniquePIs.size}
            sub="Install customers who also had an MD site audit"
            note="(phone number match across audit + install orders)"
            drill="iMDaudit"
          />
          <PctCard
            label="Job Card & Signature %"
            n={M.iJobCard}
            d={M.iCompleted}
            sub="Sub-jobs carrying a client signature on the job card"
            note="(measured from the signature, not from a rating)"
            drill="iJobCard"
          />
          <NpsCard label="NPS Score" nps={M.IR_nps} prom={M.IR_prom} det={M.IR_det} total={M.IR.length} drill="iRatings" />
          <RatingCard label="Q1 — Overall Service" avg={M.IR_q1} cnt={M.IR.length} drill="iRatings" />
          <RatingCard label="Q2 — Installer Rating" avg={M.IR_q2} cnt={M.IR.length} drill="iRatings" />
          <RatingCard label="Q3 — Site Cleanliness" avg={M.IR_q3} cnt={M.IR.length} drill="iRatings" />
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Status Breakdown</div>
        <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-2.5 border-b border-gray-100">
          {statusDefs
            .filter((sd) => M.iByStatus[sd.k])
            .map((sd) => (
              <div key={sd.k} {...tileProps('iStatus:' + sd.k, 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
                <div className={`text-xl font-bold ${sd.c}`}>{M.iByStatus[sd.k]}</div>
                <div className="text-[11px] font-semibold text-gray-400 mt-0.5">{sd.l}</div>
                <div className="text-[11px] text-gray-400">{M.iTotal ? Math.round((M.iByStatus[sd.k] / M.iTotal) * 100) + '%' : '—'}</div>
              </div>
            ))}
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Delivery Date Tracking</div>
        <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4 border-b border-gray-100">
          <div {...tileProps('iDelayLog', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
            <div className="text-xl font-bold text-red-600">{M.iDelayed}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Delay mentioned in log</div>
          </div>
          <div {...tileProps('iNoDelayLog', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
            <div className="text-xl font-bold text-green-600">{M.iTotal - M.iDelayed}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">No delay mentioned</div>
          </div>
          <div className="w-px self-stretch bg-gray-200"></div>
          <div {...tileProps('iOrigTracked', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
            <div className="text-xl font-bold text-blue-600">{M.origTracked}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">With original date tracked</div>
          </div>
          <div {...tileProps('iConfirmedDelayed', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
            <div className="text-xl font-bold text-amber-600">{M.confirmedDelayed}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Confirmed delayed (date changed)</div>
          </div>
          {M.origTracked === 0 ? (
            <div className="text-[11.5px] text-gray-400 self-center">Original date tracking started 2 Jul 2026 — no data for this range yet.</div>
          ) : null}
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Live Operations</div>
        <div {...tileProps('iNeedAction', `px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-gray-100 ${M.naCount > 0 ? 'bg-amber-50' : 'bg-green-50'}`)}>
          <div className={`text-4xl font-black leading-none ${M.naCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>{M.naCount}</div>
          <div>
            <div className={`text-[13.5px] font-bold ${M.naCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {M.naCount > 0 ? M.naCount + ' install order' + (M.naCount !== 1 ? 's need' : 'needs') + ' SM attention right now' : 'All clear — no install orders need action'}
            </div>
            <div className="text-[11.5px] text-gray-400 mt-0.5">
              Overdue ops calls + overdue follow-ups + reschedule orders · Live count, not filtered by date range
            </div>
          </div>
        </div>

        <BookExecSection
          api={chartApi}
          from={from}
          to={to}
          bookings={M.iBookings}
          executions={M.iExecs}
          tats={M.iTats}
          bookLabel="order placed"
          execLabel="sub-job done"
          tatLabel="installations"
          tatNote="Bookings are counted once per install ORDER on its created_at; executions are counted per SUB-JOB on its completion date, so an order with a wallpaper and a flooring sub-job books once and executes twice. TAT is measured from the parent order&rsquo;s created_at to each sub-job&rsquo;s completion date. Orders created before 1 Jul 2026 carry no log in this tab&rsquo;s payload, so their completion date falls back to the scheduled date — the same documented limitation as the metrics above."
        />

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Per-Installer Breakdown</div>
        {M.installers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Installer</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Orders</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Completed</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                    On-time Arrival % <small className="normal-case font-normal">from 2 Jul 2026</small>
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q1 Overall</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q2 Installer</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q3 Cleanliness</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Area / Rolls</th>
                </tr>
              </thead>
              <tbody>
                {M.installers.map((inst: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold">{inst.name}</td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{inst.orders}</td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{inst.completed}</td>
                    <ArrCell onTime={inst.arrOnTime} late={inst.arrLate} />
                    <RatingCell arr={inst.q1} />
                    <RatingCell arr={inst.q2} />
                    <RatingCell arr={inst.q3} />
                    <td className="px-3 py-2.5 text-[11px] border-t border-gray-100">
                      {inst.wfQty ? <span className="text-gray-400">{Math.round(inst.wfQty)} sq.ft flooring</span> : null}
                      {inst.wpSqft ? (
                        <>
                          <span className="text-gray-400">
                            {inst.wfQty ? ' · ' : ''}
                            {Math.round(inst.wpSqft)} sq.ft wallpaper ·{' '}
                          </span>
                          <b className="text-purple-600">
                            {inst.wpRolls} roll{inst.wpRolls === 1 ? '' : 's'}
                          </b>
                        </>
                      ) : null}
                      {!inst.wfQty && !inst.wpSqft ? <span className="text-gray-400">—</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-4 text-[13px] text-gray-400">No installer assignments in this date range.</div>
        )}
      </div>

      {/* ══ SITE AUDIT ══ */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3.5 px-4 sm:px-6 py-4 border-b border-gray-100">
          <span className="text-2xl flex-none">🔍</span>
          <div className="flex-1">
            <div className="text-base font-bold text-black">Site Audit</div>
            <div className="text-[12px] text-gray-400 mt-0.5">
              Filtered by scheduled audit date · {from} to {to}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold text-black">{M.aTotal}</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Total Audits in Range</div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Overview</div>
        <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-gray-100">
          <PctCard
            label="Job Card & Signature %"
            n={M.aJobCard}
            d={M.aSignKnown ? M.aCompleted : 0}
            sub="Completed audits carrying a client signature"
            note={M.aSignKnown ? '(measured from the signature, not from a rating)' : "Couldn't read signatures — this is not 0%"}
            drill="aJobCard"
          />
          <PctCard label="Completion Rate %" n={M.aCompleted} d={M.aTotal} sub="Audits that reached completed status" note="" drill="aCompletion" />
          <PctCard label="Auditor Arrival On Time %" n={M.aArrTot.onTime} d={M.aArrTot.onTime + M.aArrTot.late} sub="> 3 min past slot = delayed" note={aArrNote} drill="aArrival" />
          <PctCard label="Reschedule Rate %" n={M.aRescheduled} d={M.aTotal} sub="Audits currently in reschedule status" note="" drill="aReschedule" />
          <NpsCard label="NPS Score" nps={M.AR_nps} prom={M.AR_prom} det={M.AR_det} total={M.AR.length} drill="aRatings" />
          <RatingCard label="Q1 — Overall Service" avg={M.AR_q1} cnt={M.AR.length} drill="aRatings" />
          <RatingCard label="Q2 — Auditor Rating" avg={M.AR_q2} cnt={M.AR.length} drill="aRatings" />
          <RatingCard label="Q3 — Site Cleanliness" avg={M.AR_q3} cnt={M.AR.length} drill="aRatings" />
        </div>

        <div className="px-4 sm:px-6 py-2.5 text-[11.5px] text-gray-400 border-b border-gray-100">
          Note: Rescheduled audits originally scheduled in range but moved to a future date appear under the original date AND the new date. Reschedule Rate
          counts audits currently in reschedule status within the selected range.
        </div>

        <BookExecSection
          api={chartApi}
          from={from}
          to={to}
          bookings={M.aBookings}
          executions={M.aExecs}
          tats={M.aTats}
          bookLabel="audit sold"
          execLabel="audit done"
          tatLabel="site audits"
          tatNote="One row per completed site audit whose execution lands in this range. Booking date is the audit order&rsquo;s created_at (IST); execution date is its &ldquo;Site audit completed&rdquo; log entry, falling back to the scheduled date where no such entry exists. A pre-booking made by store staff only appears once it becomes a real audit order — reserved slots are excluded from this tab entirely."
        />

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Per-Auditor Breakdown</div>
        {M.auditors.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Auditor</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Orders</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Completed</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                    On-time Arrival % <small className="normal-case font-normal">from 2 Jul 2026</small>
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q1 Overall</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q2 Auditor</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q3 Cleanliness</th>
                </tr>
              </thead>
              <tbody>
                {M.auditors.map((aud: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold">{aud.name}</td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{aud.orders}</td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{aud.completed}</td>
                    <ArrCell onTime={aud.arrOnTime} late={aud.arrLate} />
                    <RatingCell arr={aud.q1} />
                    <RatingCell arr={aud.q2} />
                    <RatingCell arr={aud.q3} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-4 text-[13px] text-gray-400">No audits in this date range.</div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[11px] text-gray-500 leading-relaxed">
        <b>Job Card &amp; Signature %:</b> Counts the client signature on the job card itself (audit: <code>audit_ticked.sign</code>, install:
        <code>subjobs[].jobcard.sign</code>). It used to infer this from &quot;a rating exists&quot;, which held only while the field app wrote the rating at
        the moment of signing — that stopped on 24 Aug 2026, when review scores moved to a Category Ops call made the day after.
        <br />
        <b>Arrival on time:</b> Filtered by selected date range, floor 2 Jul 2026 (when tracking began). &gt;3 min late = delayed. N/T = no tracked data in
        range.
        <br />
        <b>Delivery delay (log-based):</b> Any log entry mentioning "delay". <b>Confirmed delayed (new):</b> compares original_delivery_date vs current
        delivery_date — set for orders created from 2 Jul 2026.
        <br />
        <b>Multi-attempt counting:</b> Each subjob date = one attempt. Rescheduled orders appear once per scheduled date found in the date range (log
        parsing used for post-July 2026 data).
        <br />
        <b>NPS &amp; ratings:</b> Attached to each completed job by its order id — audit is unambiguous (one order, one score, latest write wins); install
        matches the rated installer&apos;s email first, then nearest completion date, since a rating&apos;s order id names the parent order and not which of
        its sub-jobs was reviewed. So the score count is always a subset of that section&apos;s completed total, and a score counts in the period of the job
        it describes, not the period the Category Ops call happened in. The last few days of any range will show fewer scores than jobs — those D+1 calls
        have not been made yet. With a city selected, scores follow their order&apos;s city (the ratings table has no city of its own).
        <br />
        <b>NPS:</b> {NPS_HOUSE_NOTE} Range −100 to +100. Not comparable with the store-visit NPS on the <b>NPS</b> tab, which asks a different question of
        footfall customers on textbook bands.
      </div>
    </div>
  );
}

/* ── The drill-down modal ──────────────────────────────────────────────────────────────────
   Opens off any tile and shows the rows behind the number, numerator first, with a one-click CSV
   so an SM can work the "didn't happen" list rather than just read a percentage. Deliberately not
   built on the module's HTML-string modal — this half of the page is React, and these rows carry a
   phone number worth making tappable. */
function DrillModal({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const yes = drill.rows.filter((r) => r.hit === 'yes');
  const no = drill.rows.filter((r) => r.hit === 'no');
  const na = drill.rows.filter((r) => r.hit === 'na');
  const den = yes.length + no.length;
  const pct = den ? Math.round((yes.length / den) * 100) : null;
  // Numerator first, then the misses, then anything unjudged — the order an SM reads it in.
  const ordered = [...yes, ...no, ...na];

  // Esc to close: this modal is opened by a click on a tile, so the keyboard has to have a way out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    const header = ['Enquiry ID', 'Customer', 'Phone', 'BM', 'Assigned to', 'Slot', 'Date', 'Counts', 'Result'];
    downloadCsv(
      drill.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase(),
      [header].concat(ordered.map((r) => [r.pi, r.customer, r.phone, r.bm, r.person, r.slot, r.date, r.hit === 'yes' ? 'yes' : r.hit === 'no' ? 'no' : 'n/a', r.result]))
    );
  };

  const cell = 'px-3 py-2 text-[12.5px] border-t border-gray-100 align-middle';
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/45 p-3 sm:p-6" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex-1">
            <h3 className="text-[15px] font-bold text-black">{drill.title}</h3>
            <div className="mt-1 text-[12px] text-gray-500">
              {drill.summary ? (
                drill.summary
              ) : !drill.rows.length ? (
                'No rows in this range'
              ) : den ? (
                <>
                  <b className="text-green-700">{yes.length}</b> of <b>{den}</b>
                  {pct !== null ? <> — {pct}%</> : null}
                  {no.length ? (
                    <>
                      {' · '}
                      <b className="text-red-700">{no.length}</b> did not
                    </>
                  ) : null}
                </>
              ) : (
                <>{drill.rows.length} row(s), none of which can be judged</>
              )}
              {!drill.summary && na.length ? <> · {na.length} not judged</> : null}
            </div>
          </div>
          <button onClick={onClose} className="-mt-1 cursor-pointer border-0 bg-transparent text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </div>

        {drill.note ? <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-[11.5px] leading-relaxed text-gray-500">{drill.note}</div> : null}

        <div className="flex-1 overflow-auto">
          {ordered.length ? (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {['Enquiry ID', 'Customer', 'Phone', 'BM', 'Assigned to', 'Slot', 'Date', 'Result'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((r, i) => (
                  <tr key={i} className={r.hit === 'yes' ? 'bg-green-50/40' : r.hit === 'no' ? 'bg-red-50/40' : ''}>
                    <td className={cell + ' font-mono text-[11.5px] whitespace-nowrap'}>{r.pi || '—'}</td>
                    <td className={cell}>{r.customer || '—'}</td>
                    <td className={cell + ' whitespace-nowrap'}>
                      {r.phone ? (
                        <a href={'tel:' + r.phone} className="text-blue-600 hover:underline">
                          {r.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cell}>{r.bm || '—'}</td>
                    <td className={cell}>{r.person || '—'}</td>
                    <td className={cell + ' whitespace-nowrap text-gray-500'}>{r.slot || '—'}</td>
                    <td className={cell + ' whitespace-nowrap text-gray-500'}>{r.date || '—'}</td>
                    <td className={cell + ' ' + (r.hit === 'yes' ? 'font-semibold text-green-700' : r.hit === 'no' ? 'text-red-700' : 'text-gray-500')}>{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-gray-400">Nothing in this date range.</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
          <span className="text-[11px] text-gray-400">Green = counts toward the metric · red = does not</span>
          <button
            onClick={download}
            disabled={!ordered.length}
            className="cursor-pointer rounded-md bg-[#1F3A5F] px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⬇ Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bookings vs executions + turnaround, drawn with the shared chart primitives ──────────
   Rendered as HTML from md-cat-analytics.js (mdAnGrouped / mdAnTatHtml) rather than rebuilt in
   JSX, so this block is pixel-identical to the same block in the Admin console and to the
   commercial tabs' own charts. The rows it counts are computed above, off the ops DB. */
function BookExecSection({
  api,
  from,
  to,
  bookings,
  executions,
  tats,
  bookLabel,
  execLabel,
  tatLabel,
  tatNote,
}: {
  api: CatAnalyticsApi | null;
  from: string;
  to: string;
  bookings: Array<{ date: string | null }>;
  executions: Array<{ date: string | null }>;
  tats: Array<number | null>;
  bookLabel: string;
  execLabel: string;
  tatLabel: string;
  tatNote: string;
}) {
  const html = useMemo(() => {
    if (!api) return '';
    const buckets = api.mdAnBuckets(from, to).map((b) => ({
      ...b,
      vals: [
        bookings.filter((x) => x.date && x.date >= b.from && x.date <= b.to).length,
        executions.filter((x) => x.date && x.date >= b.from && x.date <= b.to).length,
      ],
    }));
    const nb = bookings.length;
    const ne = executions.length;
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
    const series = [
      { label: 'Booked (' + bookLabel + ')', color: '#5b3aa6' },
      { label: 'Executed (' + execLabel + ')', color: '#0f6e74' },
    ];
    const gap = nb - ne;
    return `
    <div class="an-sub-head">Bookings vs executions</div>
    <div class="an-deliv-row">
      <div class="an-deliv-stat"><div class="an-deliv-val" style="color:var(--purple)">${nb}</div><div class="an-deliv-lbl">Booked in range<br><span style="font-weight:400">${api.mdAnNum1(nb / days)} / day</span></div></div>
      <div class="an-deliv-stat"><div class="an-deliv-val" style="color:var(--teal)">${ne}</div><div class="an-deliv-lbl">Executed in range<br><span style="font-weight:400">${api.mdAnNum1(ne / days)} / day</span></div></div>
      <div class="an-deliv-stat"><div class="an-deliv-val" style="color:${gap > 0 ? 'var(--amber)' : 'var(--green)'}">${gap > 0 ? '+' : ''}${gap}</div><div class="an-deliv-lbl">Booked minus executed<br><span style="font-weight:400">${gap > 0 ? 'work flowing into the queue' : 'queue drained in this window'}</span></div></div>
      <div style="font-size:11.5px;color:var(--muted);align-self:center;max-width:340px;line-height:1.55">A booking counts on the day it was <b>sold</b>; an execution counts on the day the work was <b>done</b>. The two rarely land in the same bucket, which is the whole point of splitting them.</div>
    </div>
    <div style="padding:14px 20px 4px">${api.mdAnGrouped(buckets, series, 160)}</div>
    <div style="overflow-x:auto;padding:0 0 6px"><table class="an-inst-table">
      <thead><tr><th>${buckets.length && buckets[0].days === 1 ? 'Day' : 'Bucket'}</th><th style="text-align:right">Days</th>
        <th style="text-align:right">Booked</th><th style="text-align:right">Booked / day</th>
        <th style="text-align:right">Executed</th><th style="text-align:right">Executed / day</th></tr></thead>
      <tbody>${buckets
        .map(
          (b) => `<tr><td style="font-weight:700;white-space:nowrap">${b.label}</td>
        <td style="text-align:right;color:var(--muted)">${b.days}</td>
        <td style="text-align:right">${b.vals[0]}</td><td style="text-align:right;color:var(--muted)">${api.mdAnNum1(b.vals[0] / b.days)}</td>
        <td style="text-align:right">${b.vals[1]}</td><td style="text-align:right;color:var(--muted)">${api.mdAnNum1(b.vals[1] / b.days)}</td></tr>`
        )
        .join('')}</tbody>
    </table></div>
    <div class="an-sub-head">Turnaround — booking to execution</div>
    ${api.mdAnTatHtml(api.mdAnTatStats(tats), tatLabel)}
    <div style="font-size:11.5px;color:var(--muted);padding:0 20px 14px;line-height:1.6">${tatNote}</div>`;
  }, [api, from, to, bookings, executions, tats, bookLabel, execLabel, tatLabel, tatNote]);

  if (!api) return null;
  return <div className="md-an" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
   THE ANALYTICS SHELL — one tab per question.

   Ported from material-depot-site's Admin console (its Analytics V3 revamp), which is where the
   commercial tabs come from. Five tabs over two sources that are deliberately never mixed:

     Category · Execution · Week on week · Penetration · Targets

   Execution is this repo's own ops-DB view (above). The other four are COMMERCIAL — carts,
   orders, order value, attach rate, audit → order conversion, store penetration, targets — and
   read the order book through public/md-cat-analytics.js. An order lives in the order book, a
   site visit lives in the ops DB, and the only bridge between them is the customer phone number,
   so no tile ever adds one to the other.

   ROLE GATE: a service manager gets Execution and nothing else. The commercial tabs carry
   revenue, AOV and store targets, which that role does not get. `execOnly` is passed by every
   service-manager host (the SM's own dashboard, the SM view inside the Role Viewer, and the
   /site-audit-view SM body); the oversight rail passes nothing and gets all five. It is gated in
   two places — the tab bar only renders Execution, AND `pick` refuses anything else, so a stale
   localStorage tab or a stray call can't get past it. Role gating in this app is client-side
   throughout, so this is a scoping rule rather than a security boundary, same as the rail items.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

/* Mirrors MD_AN_TABS in md-cat-analytics.js. Hardcoded rather than read from that module because
   the bar has to be on screen before the 127 KB module has loaded — the Execution tab must not
   wait on a download it doesn't need. Keep the two lists in step. */
const AN_TABS: Array<{ k: string; ico: string; label: string; sub: string }> = [
  { k: 'category', ico: '📦', label: 'Category', sub: 'Carts, orders, value, attach rate, audit conversion' },
  { k: 'execution', ico: '🔧', label: 'Execution', sub: 'Bookings, executions, TAT, arrival on time, NPS' },
  { k: 'weekly', ico: '📈', label: 'Week on week', sub: 'Every category, week by week' },
  { k: 'penetration', ico: '🏬', label: 'Penetration', sub: 'Store maturity and category penetration' },
  { k: 'targets', ico: '🎯', label: 'Targets', sub: 'Set targets and see what is failing' },
];

const AN_TAB_KEY = 'md_an_tab';

export default function SiteAuditAnalyticsView({ city = 'all', execOnly = false }: { city?: CityFilter; execOnly?: boolean } = {}) {
  const [tab, setTab] = useState<string>(() => {
    if (execOnly) return 'execution';
    try {
      const saved = localStorage.getItem(AN_TAB_KEY);
      if (saved && AN_TABS.some((t) => t.k === saved)) return saved;
    } catch {
      /* private mode / storage disabled — the default tab is fine */
    }
    return 'category';
  });

  const pick = useCallback(
    (k: string) => {
      if (execOnly && k !== 'execution') return;
      setTab(k);
      try {
        localStorage.setItem(AN_TAB_KEY, k);
      } catch {
        /* nothing to do — the choice just won't survive a reload */
      }
    },
    [execOnly]
  );

  // A role that loses the commercial tabs must not be left on one it can no longer render.
  useEffect(() => {
    if (execOnly && tab !== 'execution') setTab('execution');
  }, [execOnly, tab]);

  const tabs = execOnly ? AN_TABS.filter((t) => t.k === 'execution') : AN_TABS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-black">Analytics</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          {execOnly
            ? 'Field-operations execution. Each tab keeps its own definitions visible — no number on this page is left unexplained.'
            : 'Category commercial performance and field-operations execution, in one place. Each tab keeps its own definitions visible — no number on this page is left unexplained.'}
        </p>
      </div>

      <div className="md-an">
        <div className="an-tabs">
          {tabs.map((t) => (
            <button key={t.k} className={`an-tab${t.k === tab ? ' active' : ''}`} onClick={() => pick(t.k)}>
              <span>
                {t.ico} {t.label}
                <small>{t.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'execution' ? (
        <ExecutionAnalyticsView city={city} />
      ) : (
        <CatAnalyticsPanel tab={tab as CommercialTab} city={city} onTabChange={pick} />
      )}
    </div>
  );
}

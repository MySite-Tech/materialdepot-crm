'use client';

import { useEffect, useMemo, useState } from 'react';
import { avgScore, inCity, npsFrom, sbGetLong, NPS_BAND_LABELS, NPS_HOUSE_NOTE, SQFT_PER_ROLL, type CityFilter } from './siteAuditShared';
import { typeLabel } from './auditRegistry';

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

function _anArrivalStats(orders: any[], trackFrom: string, trackTo: string, isInstall: boolean) {
  const map: Record<string, { onTime: number; late: number }> = {};
  for (const o of orders) {
    for (const l of o.log || []) {
      if (!l.t || !l.d || !l.who) continue;
      if (!l.t.toLowerCase().includes('arrived at site')) continue;
      const dateIST = _anDateIST(l.d);
      if (dateIST < trackFrom || dateIST > trackTo) continue;
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
      const diff = _anMinsIST(l.d) - (sh * 60 + sm2);
      if (!map[l.who]) map[l.who] = { onTime: 0, late: 0 };
      if (diff > 3) map[l.who].late++;
      else map[l.who].onTime++;
    }
  }
  return map;
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

export default function SiteAuditAnalyticsView({ city = 'all' }: { city?: CityFilter } = {}) {
  const [analyticsFrom, setAnalyticsFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 6);
    return _anDstr(t);
  });
  const [analyticsTo, setAnalyticsTo] = useState(() => _anDstr(new Date()));

  const [state, setState] = useState<AnalyticsState>({ loading: true, error: false, data: null });
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
          sbGetLong('install_orders_slim?select=id,pi,status,subjobs,service,delivery_date,created_at,city&status=neq.deleted'),
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
          o.phone = lm[o.pi]?.phone || null;
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
      <>
        <div className="mb-5">
          <h1 className="text-xl font-bold text-black">Analytics</h1>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-[13px] font-semibold text-red-600">
          ⚠ Failed to load analytics data — network timeout. Please try again.
        </div>
      </>
    );

  return (
    <AnalyticsBody
      data={state.data as AnalyticsData}
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
    const iArrMap = _anArrivalStats(installs, iTrackFrom, to, true);
    const aArrMap = _anArrivalStats(audits, aTrackFrom, to, false);
    const sumArr = (map: Record<string, { onTime: number; late: number }>) =>
      Object.values(map).reduce((s, v) => ({ onTime: s.onTime + v.onTime, late: s.late + v.late }), { onTime: 0, late: 0 });
    const iArrTot = sumArr(iArrMap),
      aArrTot = sumArr(aArrMap);

    const installers = _anInstallerMap(iAttempts, iRatingMap, iArrMap);
    const auditors = _anAuditorMap(aFiltered, aRatingMap, aArrMap);

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

    return {
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

  function PctCard({ label, n, d, sub, note }: { label: string; n: number; d: number; sub?: string; note?: string }) {
    const p = pc(n, d);
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
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
  function RatingCard({ label, avg, cnt }: { label: string; avg: number | null; cnt: number }) {
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
      <div className="rounded-lg border border-gray-200 bg-white p-4">
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
  function NpsCard({ label, nps, prom, det, total }: { label: string; nps: number | null; prom: number; det: number; total: number }) {
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
      <div className="rounded-lg border border-gray-200 bg-white p-4">
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
      <div>
        <h1 className="text-xl font-bold text-black">Analytics</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Operational metrics. Each scheduling attempt counted separately — a rescheduled order appears twice if both dates fall in the range.
        </p>
      </div>

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
          <PctCard label="Installer Arrival On Time %" n={M.iArrTot.onTime} d={M.iArrTot.onTime + M.iArrTot.late} sub="> 3 min past slot = delayed" note={iArrNote} />
          <PctCard
            label="Material Depot Audit %"
            n={M.iMDaudit}
            d={M.iUniquePIs.size}
            sub="Install customers who also had an MD site audit"
            note="(phone number match across audit + install orders)"
          />
          <PctCard
            label="Job Card & Signature %"
            n={M.iJobCard}
            d={M.iCompleted}
            sub="Sub-jobs carrying a client signature on the job card"
            note="(measured from the signature, not from a rating)"
          />
          <NpsCard label="NPS Score" nps={M.IR_nps} prom={M.IR_prom} det={M.IR_det} total={M.IR.length} />
          <RatingCard label="Q1 — Overall Service" avg={M.IR_q1} cnt={M.IR.length} />
          <RatingCard label="Q2 — Installer Rating" avg={M.IR_q2} cnt={M.IR.length} />
          <RatingCard label="Q3 — Site Cleanliness" avg={M.IR_q3} cnt={M.IR.length} />
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Status Breakdown</div>
        <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-2.5 border-b border-gray-100">
          {statusDefs
            .filter((sd) => M.iByStatus[sd.k])
            .map((sd) => (
              <div key={sd.k} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]">
                <div className={`text-xl font-bold ${sd.c}`}>{M.iByStatus[sd.k]}</div>
                <div className="text-[11px] font-semibold text-gray-400 mt-0.5">{sd.l}</div>
                <div className="text-[11px] text-gray-400">{M.iTotal ? Math.round((M.iByStatus[sd.k] / M.iTotal) * 100) + '%' : '—'}</div>
              </div>
            ))}
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Delivery Date Tracking</div>
        <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4 border-b border-gray-100">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]">
            <div className="text-xl font-bold text-red-600">{M.iDelayed}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Delay mentioned in log</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]">
            <div className="text-xl font-bold text-green-600">{M.iTotal - M.iDelayed}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">No delay mentioned</div>
          </div>
          <div className="w-px self-stretch bg-gray-200"></div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]">
            <div className="text-xl font-bold text-blue-600">{M.origTracked}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">With original date tracked</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]">
            <div className="text-xl font-bold text-amber-600">{M.confirmedDelayed}</div>
            <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Confirmed delayed (date changed)</div>
          </div>
          {M.origTracked === 0 ? (
            <div className="text-[11.5px] text-gray-400 self-center">Original date tracking started 2 Jul 2026 — no data for this range yet.</div>
          ) : null}
        </div>

        <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Live Operations</div>
        <div className={`px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-gray-100 ${M.naCount > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
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
          />
          <PctCard label="Completion Rate %" n={M.aCompleted} d={M.aTotal} sub="Audits that reached completed status" note="" />
          <PctCard label="Auditor Arrival On Time %" n={M.aArrTot.onTime} d={M.aArrTot.onTime + M.aArrTot.late} sub="> 3 min past slot = delayed" note={aArrNote} />
          <PctCard label="Reschedule Rate %" n={M.aRescheduled} d={M.aTotal} sub="Audits currently in reschedule status" note="" />
          <NpsCard label="NPS Score" nps={M.AR_nps} prom={M.AR_prom} det={M.AR_det} total={M.AR.length} />
          <RatingCard label="Q1 — Overall Service" avg={M.AR_q1} cnt={M.AR.length} />
          <RatingCard label="Q2 — Auditor Rating" avg={M.AR_q2} cnt={M.AR.length} />
          <RatingCard label="Q3 — Site Cleanliness" avg={M.AR_q3} cnt={M.AR.length} />
        </div>

        <div className="px-4 sm:px-6 py-2.5 text-[11.5px] text-gray-400 border-b border-gray-100">
          Note: Rescheduled audits originally scheduled in range but moved to a future date appear under the original date AND the new date. Reschedule Rate
          counts audits currently in reschedule status within the selected range.
        </div>

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

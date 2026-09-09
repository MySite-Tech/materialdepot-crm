import { JOB_STATUS, NPS_HOUSE_NOTE, avgScore, npsFrom } from '../../../shared/format';
import { AnalyticsData, Drill, DrillRow } from '../types';
import { _anAuditSigned, _anDateIST, _anDstr, _anInstallSigned, npsSummary } from '../utils';
import { _anArrivalStats, _anAttachAuditRatings, _anAttachInstallRatings, _anAuditorMap, _anInstallAttempts, _anInstallerMap } from './aggregate';
export function computeAnalyticsMetrics(data: AnalyticsData, from: string, to: string) {
  const { installs, audits, ratings, auditSignOk } = data;
  const todayStr = _anDstr(new Date());
  const TRACK_FROM = '2026-07-02';

  const iAttempts = _anInstallAttempts(installs, from, to);
  const iTotal = iAttempts.length;
  const aFiltered = audits.filter((o) => o.date && o.date >= from && o.date <= to);
  const aTotal = aFiltered.length;

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

  const iJobCard = iAttempts.filter((a) => ['completed', 'partial'].includes(a.status) && _anInstallSigned(a)).length;
  const avgA = (arr: any[], k: string) => avgScore(arr.map((r) => r[k]));
  const IR_q1 = avgA(IR, 'q1_score'),
    IR_q2 = avgA(IR, 'q2_score'),
    IR_q3 = avgA(IR, 'q3_score');

  const IR_nps_s = npsFrom(IR.map((r) => r.q1_score));
  const IR_prom = IR_nps_s.prom, IR_det = IR_nps_s.det, IR_nps = IR_nps_s.nps;

  const aCompleted = aFiltered.filter((o) => o.status === 'completed').length;
  const aJobCard = aFiltered.filter((o) => o.status === 'completed' && _anAuditSigned(o)).length;

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
}

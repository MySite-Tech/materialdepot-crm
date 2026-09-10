'use client';

import { typeLabel } from '../../../data/audit-registry';
import { SQFT_PER_ROLL } from '../../../shared';
import { _anDateIST, _anHhMmIST, _anMinsIST } from '../utils';

export function _anInstallAttempts(installs: any[], from: string, to: string) {
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

          orderId: o.id,
          sjId: sj.id,

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

export function _anArrivalStats(orders: any[], trackFrom: string, trackTo: string, isInstall: boolean) {
  const map: Record<string, { onTime: number; late: number }> = {};
  const tagged: Array<{ pi: string; date: string; order: any; who: string; slot: string; arrivedAt: string; diff: number; bucket: 'onTime' | 'late' }> = [];
  const seenVisits = new Set<string>();
  for (const o of orders) {
    for (const l of o.log || []) {
      if (!l.t || !l.d || !l.who) continue;
      if (!l.t.toLowerCase().includes('arrived at site')) continue;
      const dateIST = _anDateIST(l.d);
      if (dateIST < trackFrom || dateIST > trackTo) continue;

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

export function _anAttachAuditRatings(completedRows: any[], ratings: any[]) {
  const byOrder: Record<string, any> = {};
  const byPi: Record<string, any> = {};
  for (const r of ratings) {
    if (r.order_type !== 'audit') continue;

    const keep = (cur: any) => !cur || String(r.created_at || '') > String(cur.created_at || '');
    if (r.order_id) { if (keep(byOrder[r.order_id])) byOrder[r.order_id] = r; }
    else if (r.pi && keep(byPi[r.pi])) byPi[r.pi] = r;
  }
  const map = new Map<any, any>();
  for (const o of completedRows) {
    const r = (o.id && byOrder[o.id]) || byPi[o.pi];
    if (r) map.set(o, r);
  }
  return map;
}

export function _anAttachInstallRatings(attempts: any[], ratings: any[]) {

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

export function _anInstallerMap(attempts: any[], iRatingMap: Map<any, any>, arrMap: Record<string, { onTime: number; late: number }>) {
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

export function _anAuditorMap(auditFiltered: any[], aRatingMap: Map<any, any>, arrMap: Record<string, { onTime: number; late: number }>) {
  const map: Record<string, any> = {};
  for (const o of auditFiltered) {
    const k = o.auditor_email || o.auditor_name;
    if (!k) continue;
    if (!map[k]) map[k] = { name: o.auditor_name || k, email: o.auditor_email || '', orders: 0, completed: 0, q1: [] as number[], q2: [] as number[], q3: [] as number[] };
    map[k].orders++;
    if (o.status === 'completed') map[k].completed++;
  }

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

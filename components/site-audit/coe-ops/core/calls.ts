import { typeLabel } from '../../data/auditRegistry';
import { coeCalls } from './checkpoints';
import { PROJECTION_WINDOW_MS } from '../../constants/coe';
import { installPrimaryInstaller } from './reviews';
import { CoeInstall, CoeOrder, RatingRow, ScoredCall } from '../../types/coe';
import { postJobRating } from './writes';

export function scoredCalls(orders: CoeOrder[], installs: CoeInstall[]): ScoredCall[] {
  const out: ScoredCall[] = [];
  for (const o of orders) {
    for (const c of coeCalls(o)) {
      const r = c.ratings;
      if (!r || !r.q1) continue;
      out.push({
        key: o.id + '|' + c.id, orderType: 'audit', at: c.ts,
        q1: +r.q1, q2: +r.q2, q3: +r.q3,
        customer: o.name || o.pi || '—', staffName: o.auditorName,
        label: 'Site audit · ' + (o.name || o.pi || '—') + (o.auditorName ? ' · audited by ' + o.auditorName : ''),
        input: {
          orderType: 'audit', pi: o.pi, orderId: o.id,
          staffEmail: o.auditorEmail, staffName: o.auditorName,
          q1: +r.q1, q2: +r.q2, q3: +r.q3, comments: c.note || '',
          customerName: o.name, customerPhone: o.phone,
        },
      });
    }
  }
  for (const io of installs) {
    for (const sj of io.subjobs || []) {
      const inst = installPrimaryInstaller(sj);
      for (const c of sj.coe_review?.calls || []) {
        const r = c.ratings;
        if (!r || !r.q1) continue;
        out.push({
          key: io.id + '|' + sj.id + '|' + c.id, orderType: 'install', at: c.ts,
          q1: +r.q1, q2: +r.q2, q3: +r.q3,
          customer: io.name || io.pi || '—', staffName: inst.name,
          label: typeLabel(sj.type) + ' installation · ' + (io.name || io.pi || '—') + (inst.name ? ' · installed by ' + inst.name : ''),
          input: {
            orderType: 'install', pi: io.pi, orderId: String(io.id),
            staffEmail: inst.email, staffName: inst.name,
            q1: +r.q1, q2: +r.q2, q3: +r.q3, comments: c.note || '',
            customerName: io.name, customerPhone: io.phone,
          },
        });
      }
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function unprojectedScoredCalls(scored: ScoredCall[], ratingRows: RatingRow[]): ScoredCall[] {
  const bucket = new Map<string, RatingRow[]>();
  const keyOf = (type: string, orderId: string | null, pi: string | null) =>
    type + '|' + (orderId ? 'id:' + orderId : 'pi:' + (pi || ''));
  for (const r of ratingRows || []) {
    if (r.order_type !== 'audit' && r.order_type !== 'install') continue;

    for (const k of new Set([keyOf(r.order_type, r.order_id, r.pi), keyOf(r.order_type, null, r.pi)])) {
      if (!bucket.has(k)) bucket.set(k, []);
      bucket.get(k)!.push(r);
    }
  }
  const used = new Set<RatingRow>();
  const missing: ScoredCall[] = [];

  for (const sc of scored.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const cands = [
      ...(bucket.get(keyOf(sc.orderType, sc.input.orderId, sc.input.pi)) || []),
      ...(bucket.get(keyOf(sc.orderType, null, sc.input.pi)) || []),
    ].filter((r) => !used.has(r));
    const ts = new Date(sc.at).getTime();
    const inWindow = cands.filter((r) => Math.abs(new Date(r.created_at).getTime() - ts) <= PROJECTION_WINDOW_MS);
    const staffMatch = (r: RatingRow) => !r.staff_email || !sc.input.staffEmail || r.staff_email === sc.input.staffEmail;
    const hit =
      inWindow.find(staffMatch) ||
      inWindow[0] ||
      cands.find((r) => Number(r.q1_score) === sc.q1 && Number(r.q2_score) === sc.q2 && Number(r.q3_score) === sc.q3 && staffMatch(r));
    if (hit) used.add(hit);
    else missing.push(sc);
  }
  return missing.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export async function pushScoredCalls(missing: ScoredCall[]): Promise<{ ok: number; failed: Array<{ sc: ScoredCall; message: string }> }> {
  let ok = 0;
  const failed: Array<{ sc: ScoredCall; message: string }> = [];
  for (const sc of missing) {
    try {
      await postJobRating(sc.input);
      ok++;
    } catch (e: any) {
      failed.push({ sc, message: e?.message || 'write failed' });
    }
  }
  return { ok, failed };
}

import { phoneKey, sbGet } from '../../../shared';
import { CHECKPOINTS } from '../../constants';
import { BucketKey, CheckpointState, CoeCall, CoeInstall, CoeOrder, CoeOrderPlaced } from '../../types';
import { addDays } from '../../utils';

export function anchorDate(o: CoeOrder): string | null {
  return o.date || (o.createdAt ? String(o.createdAt).slice(0, 10) : null);
}

export function orderPlacedFor(o: CoeOrder, installsByPhone: Map<string, CoeInstall[]>): CoeOrderPlaced | null {
  const man = o.coeTrack?.order_placed || null;
  if (man && man.at) return { ...man, auto: false };
  const anchor = anchorDate(o);
  const key = phoneKey(o.phone);
  if (!anchor || !key) return null;

  const list = installsByPhone.get(key) || [];
  const hit = list.find((io) => io.createdAt && String(io.createdAt).slice(0, 10) >= anchor);
  if (!hit) return null;
  return { auto: true, kind: 'installation', ref: hit.pi || '', at: hit.createdAt!, orderId: hit.id };
}

export async function loadOrderLog(orderId: string): Promise<any[]> {
  const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=log');
  return Array.isArray(rows) && rows[0] && Array.isArray(rows[0].log) ? rows[0].log : [];
}

export function coeCalls(o: CoeOrder): CoeCall[] {
  const c = o.coeTrack?.calls;
  return Array.isArray(c) ? c : [];
}

export function checkpointState(o: CoeOrder, placed: CoeOrderPlaced | null, today: string): CheckpointState[] {
  const anchor = anchorDate(o);
  const calls = coeCalls(o);
  return CHECKPOINTS.map((cp) => {
    const done = calls.filter((c) => c.stage === cp.k).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const applies = cp.always || !placed;
    const dueOn = anchor ? addDays(anchor, cp.days) : null;
    let state: CheckpointState['state'] = 'n/a';
    if (applies) {
      if (done.length) state = 'done';
      else if (!dueOn) state = 'pending';
      else if (dueOn < today) state = 'overdue';
      else if (dueOn === today) state = 'due';
      else state = 'pending';
    }
    return { ...cp, applies, dueOn, state, calls: done, last: done.length ? done[done.length - 1] : null };
  });
}

export function bucketFor(o: CoeOrder, placed: CoeOrderPlaced | null, today: string): BucketKey {
  const t = o.coeTrack || {};
  if (t.result === 'lost') return 'lost';
  const cps = checkpointState(o, placed, today);
  const pending = cps.filter((c) => c.applies && c.state !== 'done');
  if (t.snooze_until && t.snooze_until > today && !pending.some((c) => c.state === 'overdue')) return 'snoozed';
  if (pending.some((c) => c.state === 'overdue')) return 'overdue';
  if (pending.some((c) => c.state === 'due')) return 'today';
  if (placed || t.result === 'converted') return 'converted';
  if (pending.length) return 'upcoming';
  return 'open';
}

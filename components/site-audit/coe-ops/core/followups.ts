import { bucketFor, checkpointState, orderPlacedFor } from './checkpoints';
import { CoeInstall, CoeOrder, FollowupRow } from '../../types/coe';
import { todayStr } from '../../utils/coe';

export function followupRows(orders: CoeOrder[], installByPhone: Map<string, CoeInstall[]>): FollowupRow[] {
  const today = todayStr();
  return orders.map((o) => {
    const placed = orderPlacedFor(o, installByPhone);
    const cps = checkpointState(o, placed, today);
    const bucket = bucketFor(o, placed, today);
    const nextDue = cps.filter((c) => c.applies && c.state !== 'done').sort((a, b) => String(a.dueOn || '').localeCompare(String(b.dueOn || '')))[0] || null;
    return { o, placed, cps, bucket, nextDue };
  });
}

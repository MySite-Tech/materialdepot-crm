import { FollowUpBucket } from '../../types/inbound';
import { istToday } from '../../utils/inbound';
export function followUpBucket(date: string | undefined, today = istToday()): FollowUpBucket {
  const d = String(date || '').slice(0, 10);
  if (!d) return 'none';
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

export function nextKamRoundRobin(
  kams: string[],
  currentLoad: Record<string, number>,
): string | undefined {
  if (!kams.length) return undefined;
  let best = kams[0];
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const k of kams) {
    const load = currentLoad[k] || 0;
    if (load < bestLoad) { best = k; bestLoad = load; }
  }
  return best;
}

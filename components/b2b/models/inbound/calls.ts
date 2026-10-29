import { MIN_ATTEMPTS_BEFORE_CLOSE, READY_RNR_COUNT, READY_WINDOW_DAYS } from '../../constants/inbound';
import { CallAttempt, ClosureReadiness, InboundStatus } from '../../types/inbound';
import { addDays, daysUntil, inboundWorkDay, istToday } from '../../utils/inbound';
import { istDay } from './lifecycle';

export function nextAttemptNumber(attempts: CallAttempt[] | undefined): number {
  return (attempts?.length || 0) + 1;
}

export function lastAttempt(attempts: CallAttempt[] | undefined): CallAttempt | undefined {
  const a = attempts || [];
  return a.length ? a[a.length - 1] : undefined;
}

export function hasConnected(attempts: CallAttempt[] | undefined): boolean {
  return (attempts || []).some((a) => a.outcome === 'Connected');
}

export function callTally(attempts: CallAttempt[] | undefined): { total: number; connected: number; rnr: number } {
  const a = attempts || [];
  const connected = a.filter((x) => x.outcome === 'Connected').length;
  return { total: a.length, connected, rnr: a.length - connected };
}

const MOVED_ON: InboundStatus[] = ['Follow up', 'PI Shared', 'Closed', 'Lost', 'Invalid'];

export function closureReadiness(
  l: { stage: InboundStatus; leadCreatedAt?: string; callAttempts?: CallAttempt[]; outreachReferral?: { at?: string } },
  today = istToday(),
): ClosureReadiness {
  const attempts = l.callAttempts || [];
  const since = addDays(today, 1 - READY_WINDOW_DAYS);
  const rnrInWindow = attempts.filter((a) => a.outcome === 'RNR' && istDay(a.at) >= since).length;
  const arrived = inboundWorkDay(l.leadCreatedAt);
  const ageDays = arrived ? -(daysUntil(arrived, today) ?? 0) : 0;
  if (rnrInWindow >= READY_RNR_COUNT) return { ready: true, reason: 'unreachable', rnrInWindow, ageDays };
  const stalled = ageDays >= READY_WINDOW_DAYS
    && attempts.length >= MIN_ATTEMPTS_BEFORE_CLOSE
    && !MOVED_ON.includes(l.stage)
    && !l.outreachReferral?.at;
  if (stalled) return { ready: true, reason: 'stalled', rnrInWindow, ageDays };
  return { ready: false, rnrInWindow, ageDays };
}

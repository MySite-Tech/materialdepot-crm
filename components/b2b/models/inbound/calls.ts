import { MAX_CALL_ATTEMPTS } from '../../constants/inbound';
import { CallAttempt } from '../../types/inbound';
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

export function retriesExhausted(attempts: CallAttempt[] | undefined): boolean {
  const a = attempts || [];
  return a.length >= MAX_CALL_ATTEMPTS && !hasConnected(a);
}


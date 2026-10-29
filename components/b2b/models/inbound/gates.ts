import { DISCUSSION_NOTE_MIN, ENRICHMENT_CHECKS, INVALID_NOTE_MIN, LOST_REASON_NEEDS, MIN_ATTEMPTS_BEFORE_CLOSE, READY_RNR_COUNT, READY_WINDOW_DAYS } from '../../constants/inbound';
import { EnrichmentGap, EnrichmentInput, StatusGateInput } from '../../types/inbound';

export function statusGateErrors(l: StatusGateInput): string[] {
  const errs: string[] = [];
  if (l.status === 'Follow up' && !l.followUpDate) {
    errs.push('A next follow-up date is required to set Follow up.');
  }
  if (l.status === 'PI Shared') {
    if (!String(l.enqId || '').trim()) errs.push('An Enq ID is required to set PI Shared.');
    if (!l.followUpDate) errs.push('A next follow-up date is required to set PI Shared.');
  }
  if (l.status === 'Lost') {
    const reason = String(l.lostReason || '').trim();
    const needs = LOST_REASON_NEEDS[reason];
    if (!reason) errs.push('A lost reason is required to set Lost.');
    else if (needs === 'unreachable' && l.readiness?.reason !== 'unreachable') {
      errs.push(`Lost as unreachable needs ${READY_RNR_COUNT} RNRs in the last ${READY_WINDOW_DAYS} days — ${l.readiness?.rnrInWindow ?? 0} so far.`);
    } else if (needs === 'stalled' && l.readiness?.reason !== 'stalled') {
      errs.push(`Lost as no progress needs the lead to be ${READY_WINDOW_DAYS}+ days old with at least ${MIN_ATTEMPTS_BEFORE_CLOSE} calls and still not at Follow up.`);
    } else if (!needs && !l.connected) {
      errs.push('Lost for this reason needs a Connected call — log the call where the client said it.');
    }
  }
  if (l.status === 'Invalid') {
    if (!l.calls) errs.push('Log at least one call before marking a lead Invalid — qualify it first.');
    if (!String(l.invalidReason || '').trim()) errs.push('An invalid reason is required to set Invalid.');
    if (String(l.invalidNote || '').trim().length < INVALID_NOTE_MIN) {
      errs.push(`An invalid note of at least ${INVALID_NOTE_MIN} characters is required — say what you checked.`);
    }
  }
  return errs;
}

export function connectedCallErrors(c: { note: string; durationMin: string; followUpDate: string }, today: string): string[] {
  const errs: string[] = [];
  if (c.note.trim().length < DISCUSSION_NOTE_MIN) errs.push(`Write what was discussed (at least ${DISCUSSION_NOTE_MIN} characters).`);
  if (!(Number(c.durationMin) > 0)) errs.push('Enter how many minutes the call lasted.');
  if (!c.followUpDate) errs.push('Pick the next follow-up date.');
  else if (c.followUpDate < today) errs.push('The next follow-up date is in the past.');
  return errs;
}

export function enrichmentGaps(l: EnrichmentInput): EnrichmentGap[] {
  return ENRICHMENT_CHECKS.filter((c) => !c.filled(l)).map(({ key, label }) => ({ key, label }));
}

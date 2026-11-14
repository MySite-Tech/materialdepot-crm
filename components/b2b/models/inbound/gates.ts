import { DISCUSSION_NOTE_MIN, ENRICHMENT_CHECKS, INVALID_NOTE_MIN, isEndConsumer, LOST_REASON_NEEDS, MIN_ATTEMPTS_BEFORE_CLOSE, READY_RNR_COUNT, READY_WINDOW_DAYS } from '../../constants/inbound';
import { EnrichmentGap, EnrichmentInput, InboundStatus, StatusGateInput } from '../../types/inbound';

export const INBOUND_STAGE_NEEDS: { label: string; stages: InboundStatus[]; ok: (l: StatusGateInput) => boolean; error: (s: InboundStatus) => string }[] = [
  { label: 'Enq ID',         stages: ['PI Shared', 'Closed'], ok: (l) => !!String(l.enqId || '').trim(),       error: (s) => `An Enq ID is required to set ${s}.` },
  { label: 'next follow-up', stages: ['Follow up', 'PI Shared'], ok: (l) => !!l.followUpDate,                  error: (s) => `A next follow-up date is required to set ${s}.` },
  { label: 'lost reason',    stages: ['Lost'],                ok: (l) => !!String(l.lostReason || '').trim(),    error: () => 'A lost reason is required to set Lost.' },
  { label: 'invalid reason', stages: ['Invalid'],             ok: (l) => !!String(l.invalidReason || '').trim(), error: () => 'An invalid reason is required to set Invalid.' },
  { label: 'invalid note',   stages: ['Invalid'],             ok: (l) => String(l.invalidNote || '').trim().length >= INVALID_NOTE_MIN,
    error: () => `An invalid note of at least ${INVALID_NOTE_MIN} characters is required — say what you checked.` },
];

export const missingForStage = (l: StatusGateInput) => INBOUND_STAGE_NEEDS.filter((n) => n.stages.includes(l.status) && !n.ok(l));

export function statusGateErrors(l: StatusGateInput): string[] {
  const errs = missingForStage(l).map((n) => n.error(l.status));
  if (l.status === 'Invalid' && !l.calls) errs.unshift('Log at least one call before marking a lead Invalid — qualify it first.');
  const reason = String(l.lostReason || '').trim();
  if (l.status === 'Lost' && reason) {
    const needs = LOST_REASON_NEEDS[reason];
    if (needs === 'unreachable' && l.readiness?.reason !== 'unreachable') {
      errs.push(`Lost as unreachable needs ${READY_RNR_COUNT} RNRs in the last ${READY_WINDOW_DAYS} days — ${l.readiness?.rnrInWindow ?? 0} so far.`);
    } else if (needs === 'stalled' && l.readiness?.reason !== 'stalled') {
      errs.push(`Lost as no progress needs the lead to be ${READY_WINDOW_DAYS}+ days old with at least ${MIN_ATTEMPTS_BEFORE_CLOSE} calls and still not at Follow up.`);
    } else if (!needs && !l.connected) {
      errs.push('Lost for this reason needs a Connected call — log the call where the client said it.');
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
  const consumer = isEndConsumer(l.clientType);
  return ENRICHMENT_CHECKS
    .filter((c) => !(consumer && c.firmOnly) && !c.filled(l))
    .map(({ key, label }) => ({ key, label }));
}

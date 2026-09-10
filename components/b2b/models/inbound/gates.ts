import { ENRICHMENT_CHECKS } from '../../constants/inbound';
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
  if (l.status === 'Lost' && !String(l.lostReason || '').trim()) {
    errs.push('A lost reason is required to set Lost.');
  }
  return errs;
}

export function callGateErrors(followUpDate: string | undefined): string[] {
  return followUpDate ? [] : ['A next follow-up date is required when logging a call.'];
}

export function enrichmentGaps(l: EnrichmentInput): EnrichmentGap[] {
  return ENRICHMENT_CHECKS.filter((c) => !c.filled(l)).map(({ key, label }) => ({ key, label }));
}

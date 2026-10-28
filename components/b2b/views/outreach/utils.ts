'use client';

import { OutreachLead } from '../../models/mock-data';
import { OUTREACH_STATUS_LABEL, WaitlistSignup, companyTypeLabel, meetingLocation, nextScheduledMeeting, outreachEnrichmentGaps } from '../../models/outreach';
import { HANDOVER_STATE_LABEL, handoverState } from '../../models/outreach/handover';

const waitlistCell = (w: WaitlistSignup | null | undefined): string =>
  w === undefined ? 'Unknown' : w ? `Joined ${w.createdAt.slice(0, 10)}` : 'Not joined';

export const toExportRow = (l: OutreachLead, waitlist: WaitlistSignup | null | undefined, nowMs: number): (string | number)[] => {
  const next = nextScheduledMeeting(l.meetings);
  return [
    l.company || '',
    l.contactPerson || '',
    l.designation || '',
    l.phone || '',
    l.gstNumber || '',
    l.segment || '',
    l.leadType || '',
    companyTypeLabel(l.companyType, l.companyTypeOther),
    l.bm || '',
    l.meetings?.length || 0,
    (l.meetings || []).filter((m) => m.status === 'Completed').length,
    next ? `${next.date || ''}${next.time ? ` ${next.time}` : ''}` : '',
    meetingLocation(next),
    (l.selections || []).join(' / '),
    l.requirement || '',
    l.expectedOrderValue || '',
    OUTREACH_STATUS_LABEL[l.status],
    l.followUpDate || '',
    l.enqId || '',
    l.orderValue || '',
    l.expectedClosure || '',
    l.lostReason || '',
    l.spok || l.bm || '',
    l.kam || '',
    l.ecName || '',
    l.ecBmName || '',
    l.source || '',
    l.city || '',
    l.officeAddress || '',
    l.teamSize || '',
    l.whatsappGroupLink || '',
    l.convertedAt ? l.convertedAt.slice(0, 10) : '',
    HANDOVER_STATE_LABEL[handoverState(l, nowMs)],
    waitlistCell(waitlist),
  ];
};

export const gapsFor = (l: OutreachLead) => outreachEnrichmentGaps({
  contactPerson: l.contactPerson, designation: l.designation, segment: l.segment,
  leadType: l.leadType, companyType: l.companyType, selections: l.selections,
  requirement: l.requirement, expectedOrderValue: l.expectedOrderValue,
});

export const nowIso = () => new Date().toISOString();

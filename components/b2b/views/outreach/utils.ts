'use client';

import { OutreachLead } from '../../models/mock-data';
import { companyTypeLabel, meetingLocation, nextScheduledMeeting, outreachEnrichmentGaps } from '../../models/outreach';

export const toExportRow = (l: OutreachLead): (string | number)[] => {
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
    l.status,
    l.followUpDate || '',
    l.enqId || '',
    l.orderValue || '',
    l.expectedClosure || '',
    l.lostReason || '',
    l.spok || l.bm || '',
    l.kam || '',
    l.ecName || '',
    l.ecBmName || '',
  ];
};

export const gapsFor = (l: OutreachLead) => outreachEnrichmentGaps({
  contactPerson: l.contactPerson, designation: l.designation, segment: l.segment,
  leadType: l.leadType, companyType: l.companyType, selections: l.selections,
  requirement: l.requirement, expectedOrderValue: l.expectedOrderValue,
});

export const nowIso = () => new Date().toISOString();

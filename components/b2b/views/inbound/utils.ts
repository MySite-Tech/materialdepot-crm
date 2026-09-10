'use client';

import { enrichmentGaps, lastAttempt } from '../../models/inbound';
import { InboundLead } from '../../models/mock-data';
import { fmtLeadDateTime } from '../../ui/inbound-chips';

export const toExportRow = (l: InboundLead): (string | number)[] => {
  const last = lastAttempt(l.callAttempts);
  return [
    l.leadCreatedAt ? fmtLeadDateTime(l.leadCreatedAt) : '',
    l.companyName || l.company || '',
    l.contactName || '',
    l.phone || '',
    l.owner || '',
    l.gstNumber || '',
    l.segment || '',
    l.clientType || '',
    l.leadType || '',
    l.priority || '',
    l.location || '',
    (l.selections || []).join(' / '),
    l.requirement || '',
    l.expectedOrderValue || '',
    l.stage,
    l.followUpDate || '',
    l.callAttempts?.length || 0,
    last?.outcome || '',
    l.enqId || '',
    l.orderValue || '',
    l.lostReason || '',
    l.placedUnder?.spok || '',
    l.kam || '',
    l.presalesOwner || '',
  ];
};

export const gapsFor = (l: InboundLead) => enrichmentGaps({
  companyName: l.companyName, gstNumber: l.gstNumber, segment: l.segment,
  clientType: l.clientType, leadType: l.leadType, priority: l.priority,
  selections: l.selections, expectedOrderValue: l.expectedOrderValue,
});

export const istDay = (iso: string | undefined): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso).slice(0, 10);
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

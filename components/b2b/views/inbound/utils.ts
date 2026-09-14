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
    l.placedUnder?.bmName || '',
    l.placedUnder?.ecName || '',
    l.placedUnder?.ecBmName || '',
    l.kam || '',
    l.presalesOwner || '',
  ];
};

export const gapsFor = (l: InboundLead) => enrichmentGaps({
  companyName: l.companyName, gstNumber: l.gstNumber, segment: l.segment,
  clientType: l.clientType, leadType: l.leadType, priority: l.priority,
  selections: l.selections, expectedOrderValue: l.expectedOrderValue,
});

/** Newest lead first, everywhere a list of leads is shown.
 *
 * `fetchInboundBoard`'s page-0 assembly is `[...dbLeads, ...kylasNotInDb]`, so
 * the raw order is "edited in the CRM" before "untouched" rather than anything
 * to do with date — a grouping the data layer depends on and that a rewrite
 * there has already been reverted once. Sorting in the view leaves that intact
 * while the board, the list and the export all read newest-first.
 *
 * A lead with no Kylas creation date sorts last rather than jumping to the top,
 * which is what comparing an empty string the other way round would do.
 */
export const byNewestLeadFirst = (a: InboundLead, b: InboundLead): number => {
  const at = a.leadCreatedAt || '';
  const bt = b.leadCreatedAt || '';
  if (at && bt) return bt.localeCompare(at);
  if (at) return -1;
  if (bt) return 1;
  return 0;
};

export const istDay = (iso: string | undefined): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso).slice(0, 10);
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

import { ClientEntity, ClientOrderMetrics, ClientStatus } from '@/components/b2b/models/client';
import { newB2BId } from '@/components/b2b/models/ids';
import { CRM_INBOUND_ID_PREFIX } from '@/components/b2b/models/inbound';
import { InboundLead, OutreachLead, fmtShortINR } from '@/components/b2b/models/mock-data';
import { CLOSED_INBOUND, INACTIVE_FIRM } from '@/components/b2b/models/outreach';

export type SendReason = 'inactive' | 'inbound';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'an unknown date');

const PURPOSE: Record<SendReason, string> = { inactive: 'to win it back', inbound: 'for a meeting, as a firm that came through Inbound and has ordered' };

export function winBackSummary(c: ClientEntity, m: ClientOrderMetrics, status: ClientStatus, by: string, reason: SendReason): string {
  const orders = m.orders ? `${m.orders} order${m.orders === 1 ? '' : 's'} worth ${fmtShortINR(m.totalRevenue || 0)} in all` : 'no order count on record';
  const kam = c.kam ? ` Its KAM is ${c.kam}.` : ' It has no KAM.';
  return `Sent from the Client Database by ${by} ${PURPOSE[reason]}: ${status.toLowerCase()}, last order on ${day(m.lastOrderPlaced)}, ${orders}.${kam}`;
}

const people = (c: ClientEntity) => [...(c.contacts || [])].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));

export function firmToOutreach(c: ClientEntity, summary: string, by: string, at: string, reason: SendReason): OutreachLead {
  const [first, second] = people(c);
  return {
    id: newB2BId('OR'),
    company: c.company,
    contactPerson: first.name || c.company,
    phone: first.number,
    altPhone: second?.number,
    altName: second?.name,
    gstNumber: c.gsts?.[0]?.number,
    bm: '',
    source: reason === 'inbound' ? CLOSED_INBOUND : INACTIVE_FIRM,
    createdAt: at,
    status: 'Yet to Meet',
    statusChangedAt: at,
    selections: [],
    meetings: [],
    notes: [{ ts: at, author: by, text: summary }],
    value: 0,
  };
}

export function firmToInbound(c: ClientEntity, summary: string, owner: { name: string; kylasUserId: number }, by: string, at: string): InboundLead {
  const [first, ...rest] = people(c);
  return {
    id: newB2BId(CRM_INBOUND_ID_PREFIX.slice(0, -1)),
    phone: first.number,
    contactName: first.name || c.company,
    primaryContactName: first.name || c.company,
    primaryContactPhone: first.number,
    additionalContacts: rest.map((p) => ({ name: p.name || '', phone: p.number })),
    companyName: c.company,
    company: c.company,
    gstNumber: c.gsts?.[0]?.number,
    owner: owner.name,
    ownerId: owner.kylasUserId,
    source: 'Other',
    addedBy: by,
    leadSummary: summary,
    leadCreatedAt: at,
    statusChangedAt: at,
    stage: 'New',
    value: 0,
    callAttempts: [],
    calls: [],
  };
}

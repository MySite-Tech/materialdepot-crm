import type { ClientEntity } from '@/components/b2b/models/client';
import { newB2BId } from '@/components/b2b/models/ids';
import { CRM_INBOUND_ID_PREFIX } from '@/components/b2b/models/inbound';
import { InboundLead, OutreachLead, fmtShortINR } from '@/components/b2b/models/mock-data';
import { STORE_ORDERS } from '@/components/b2b/models/outreach';
import type { ReviewFirm } from '../types';

const month = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function reviewSummary(f: ReviewFirm, by: string): string {
  const span = month(f.firstOrder) === month(f.lastOrder) ? month(f.lastOrder) : `${month(f.firstOrder)} – ${month(f.lastOrder)}`;
  const where = f.stores.slice(0, 2).map((s) => s.name).join(' and ');
  return `Found on store orders and approved by ${by}: ${f.orders} order${f.orders === 1 ? '' : 's'} worth ${fmtShortINR(f.value)} billed to GSTIN ${f.gstins.join(', ')} (${span}), mostly at ${where}.`;
}

export function reviewToClient(f: ReviewFirm, by: string, at: string): ClientEntity {
  return {
    id: f.key,
    company: f.name,
    contacts: f.contacts.map((c, i) => ({ number: c.number, name: c.name, primary: i === 0 })),
    gsts: f.gstins.map((number) => ({ number })),
    source: 'Existing',
    remarks: reviewSummary(f, by),
    interactions: [],
    escalations: [],
    createdAt: at,
  };
}

export function reviewToOutreach(f: ReviewFirm, by: string, at: string): OutreachLead {
  const [first, second] = f.contacts;
  return {
    id: newB2BId('OR'),
    company: f.name,
    contactPerson: first.name || f.name,
    phone: first.number,
    altPhone: second?.number,
    altName: second?.name,
    gstNumber: f.gstins[0],
    bm: '',
    source: STORE_ORDERS,
    createdAt: at,
    status: 'Yet to Meet',
    statusChangedAt: at,
    selections: [],
    meetings: [],
    notes: [{ ts: at, author: by, text: reviewSummary(f, by) }],
    value: 0,
  };
}

export function reviewToInbound(f: ReviewFirm, owner: { name: string; kylasUserId: number }, by: string, at: string): InboundLead {
  const [first, ...rest] = f.contacts;
  return {
    id: newB2BId(CRM_INBOUND_ID_PREFIX.slice(0, -1)),
    phone: first.number,
    contactName: first.name || f.name,
    primaryContactName: first.name || f.name,
    primaryContactPhone: first.number,
    additionalContacts: rest.map((c) => ({ name: c.name || '', phone: c.number })),
    companyName: f.name,
    company: f.name,
    gstNumber: f.gstins[0],
    owner: owner.name,
    ownerId: owner.kylasUserId,
    source: 'Walk-in',
    addedBy: by,
    leadSummary: reviewSummary(f, by),
    leadCreatedAt: at,
    statusChangedAt: at,
    stage: 'New',
    value: 0,
    callAttempts: [],
    calls: [],
  };
}

import { fetchInboundBoard, fetchRows } from '../data/reads';
import { rowToOutreach } from '../mappers/outreach';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mock-data';
import { EC_B2B_REFERRAL } from '@/components/b2b/models/outreach';
import { firmPhoneList } from './enq-lookup';

export const inboundPhones = (l: Pick<InboundLead, 'phone' | 'primaryContactPhone' | 'additionalContacts'>): string[] =>
  firmPhoneList([l.phone, l.primaryContactPhone, ...(l.additionalContacts ?? []).map((c) => c.phone)]);

export const outreachPhones = (l: Pick<OutreachLead, 'phone' | 'altPhone' | 'contacts'>): string[] =>
  firmPhoneList([l.phone, l.altPhone, ...(l.contacts ?? []).map((c) => c.phone)]);

export type LeadSource = 'Inbound' | 'Outreach';

const EC_SOURCES: string[] = [EC_B2B_REFERRAL, 'EC referral'];

export const isEcReferral = (l: Pick<UnifiedLead, 'outreach'>): boolean => EC_SOURCES.includes(String(l.outreach?.source));
export type UnifiedStatus = 'Closed' | 'Yet to Close';

export interface UnifiedLead {

  key: string;
  id: string;
  source: LeadSource;
  createdAt?: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  gstNumber?: string;
  enqId?: string;
  orderValue?: number;

  expectedClosure?: string;
  hasExpectedClosureField: boolean;
  kam?: string;
  spok?: string;
  status: UnifiedStatus;

  lost: boolean;

  sourceStatus: string;

  inbound?: InboundLead;
  outreach?: OutreachLead;
}

export function inboundToUnified(l: InboundLead): UnifiedLead {
  return {
    key: `inbound:${l.id}`,
    id: l.id,
    source: 'Inbound',
    createdAt: l.leadCreatedAt || undefined,

    companyName: String(l.companyName || '').trim() || undefined,
    contactPerson: l.contactName || undefined,
    phone: l.phone || undefined,
    gstNumber: l.gstNumber || undefined,
    enqId: l.enqId || undefined,
    orderValue: l.orderValue || undefined,
    expectedClosure: undefined,
    hasExpectedClosureField: false,
    kam: l.kam || undefined,

    spok: l.placedUnder?.spok || l.owner || undefined,
    status: l.stage === 'Closed' ? 'Closed' : 'Yet to Close',
    lost: l.stage === 'Lost' || l.stage === 'Invalid',
    sourceStatus: l.stage,
    inbound: l,
  };
}

export function outreachToUnified(l: OutreachLead, rowCreatedAt?: string): UnifiedLead {
  return {
    key: `outreach:${l.id}`,
    id: l.id,
    source: 'Outreach',
    createdAt: l.ecReferral?.at || l.createdAt || rowCreatedAt || undefined,
    companyName: String(l.company || '').trim() || undefined,
    contactPerson: l.contactPerson || undefined,
    phone: l.phone || undefined,
    gstNumber: l.gstNumber || undefined,
    enqId: l.enqId || undefined,
    orderValue: l.orderValue || undefined,
    expectedClosure: l.expectedClosure || undefined,
    hasExpectedClosureField: true,
    kam: l.kam || undefined,
    spok: l.spok || l.bm || undefined,
    status: l.status === 'Closed' ? 'Closed' : 'Yet to Close',
    lost: l.status === 'Lost',
    sourceStatus: l.status,
    outreach: l,
  };
}

interface UnifiedLeadsResult {
  leads: UnifiedLead[];

  failed: LeadSource[];
}

export async function fetchUnifiedLeads(): Promise<UnifiedLeadsResult> {
  const failed: LeadSource[] = [];

  const inboundP = fetchInboundBoard()
    .then((r) => {
      if (!r.ok) failed.push('Inbound');
      return r.leads;
    })
    .catch((e) => {
      console.error('[b2b] leads tab: inbound fetch failed', e);
      failed.push('Inbound');
      return [] as InboundLead[];
    });
  const outreachP = fetchRows('outbound')
    .then((rows) => rows.map((r) => outreachToUnified(rowToOutreach(r), r.created_at ? String(r.created_at) : undefined)))
    .catch((e) => {
      console.error('[b2b] leads tab: outreach fetch failed', e);
      failed.push('Outreach');
      return [] as UnifiedLead[];
    });

  const [inbound, outreach] = await Promise.all([inboundP, outreachP]);

  return {
    leads: [...inbound.map(inboundToUnified), ...outreach]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    failed,
  };
}

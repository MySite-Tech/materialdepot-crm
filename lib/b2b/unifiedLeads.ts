import { fetchOutreachLeads } from './reads';
import { fetchInboundBoard } from './reads';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mockData';

export type LeadSource = 'Inbound' | 'Outreach';
export type UnifiedStatus = 'Closed' | 'Yet to Close';

export interface UnifiedLead {

  key: string;
  id: string;
  source: LeadSource;
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

function inboundToUnified(l: InboundLead): UnifiedLead {
  return {
    key: `inbound:${l.id}`,
    id: l.id,
    source: 'Inbound',

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
    lost: l.stage === 'Lost',
    sourceStatus: l.stage,
    inbound: l,
  };
}

function outreachToUnified(l: OutreachLead): UnifiedLead {
  return {
    key: `outreach:${l.id}`,
    id: l.id,
    source: 'Outreach',
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

  inboundTotal: number;
  inboundHasMore: boolean;

  failed: LeadSource[];
}

export async function fetchUnifiedLeads(opts?: {
  createdFrom?: string;
  createdTo?: string;
}): Promise<UnifiedLeadsResult> {
  const failed: LeadSource[] = [];

  const inboundP = fetchInboundBoard({ page: 0, createdFrom: opts?.createdFrom, createdTo: opts?.createdTo })
    .catch((e) => {
      console.error('[b2b] leads tab: inbound fetch failed', e);
      failed.push('Inbound');
      return { leads: [] as InboundLead[], page: 0, hasMore: false, total: 0 };
    });
  const outreachP = fetchOutreachLeads({ createdFrom: opts?.createdFrom, createdTo: opts?.createdTo })
    .catch((e) => {
      console.error('[b2b] leads tab: outreach fetch failed', e);
      failed.push('Outreach');
      return [] as OutreachLead[];
    });

  const [inbound, outreach] = await Promise.all([inboundP, outreachP]);

  return {
    leads: [
      ...inbound.leads.map(inboundToUnified),
      ...outreach.map(outreachToUnified),
    ],
    inboundTotal: inbound.total,
    inboundHasMore: inbound.hasMore,
    failed,
  };
}

import { rowToOutreach } from '../mappers/outreach';
import { withB2BCache } from './cache';
import { B2BLeadRow, Pipeline } from './rows';
import { b2bBackendGet } from './backend';
import { fetchB2BInboundLeads } from '@/lib/api';
import { ClientEntity, InboundLink } from '@/components/b2b/models/client';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mock-data';
import { KamOrder } from '@/components/b2b/models/kam';
import { rowToInbound } from '../mappers/inbound';
import { rowToClient } from '../mappers/client';
import { rowToKamOrder } from '../mappers/kam';

function nextDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + 86_400_000).toISOString().slice(0, 10);
}

function fetchAllRows(): Promise<B2BLeadRow[]> {
  return withB2BCache('rows|all', () => b2bBackendGet<B2BLeadRow[]>('/rows'));
}

export async function fetchRows(
  pipeline: Pipeline,
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<B2BLeadRow[]> {
  const all = await fetchAllRows();
  const to = opts?.createdTo ? nextDay(opts.createdTo) : undefined;
  return all.filter((r) => {
    if (r.pipeline !== pipeline) return false;
    const createdAt = String(r.created_at ?? '');
    if (opts?.createdFrom && createdAt < opts.createdFrom) return false;
    if (to && createdAt >= to) return false;
    return true;
  });
}

interface InboundBoard {
  leads: InboundLead[];
  total: number;
  ok: boolean;
}

const istDay = (iso?: string): string => {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? '' : new Date(ms + 19_800_000).toISOString().slice(0, 10);
};

export interface InboundBoardOpts {
  ownerId?: number;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  kylasStage?: number;
}

export function inboundBoardMatches(l: InboundLead, opts: InboundBoardOpts): boolean {
  const day = istDay(l.leadCreatedAt);
  if (day && opts.createdFrom && day < opts.createdFrom) return false;
  if (day && opts.createdTo && day > opts.createdTo) return false;
  if (opts.ownerId != null && l.ownerId !== opts.ownerId) return false;
  if (opts.kylasStage && l.kylasStage !== opts.kylasStage) return false;
  const q = (opts.search || '').trim().toLowerCase();
  return !q || [l.company, l.companyName, l.contactName, l.phone, l.primaryContactPhone]
    .some((v) => (v || '').toLowerCase().includes(q));
}

export async function fetchInboundBoard(opts: InboundBoardOpts = {}): Promise<InboundBoard> {
  const search = (opts.search || '').trim();
  const kylasP = search
    ? fetchB2BInboundLeads(0, opts.ownerId ? [opts.ownerId] : undefined, search, '', '', opts.kylasStage)
    : null;

  let leads: InboundLead[];
  try {
    leads = (await fetchRows('inbound')).map(rowToInbound);
  } catch (e) {
    console.error('[b2b] inbound rows fetch failed', e);
    return { leads: [], total: 0, ok: false };
  }
  leads = leads.filter((l) => inboundBoardMatches(l, opts));

  let ok = true;
  if (kylasP) {
    const kylas = await kylasP;
    ok = kylas.ok;
    const have = new Set(leads.map((l) => l.id));
    leads = [...leads, ...kylas.leads.filter((k) => !have.has(k.id))];
  }
  return { leads, total: leads.filter((l) => l.stage === 'New').length, ok };
}

export interface B2BData {
  inbound: InboundLead[];
  outreach: OutreachLead[];

  kam: KamOrder[];

  clients: ClientEntity[];
  inboundTotal: number;

  failed: ('inbound' | 'outreach' | 'kam' | 'clients')[];
}

export async function fetchB2BData(): Promise<B2BData> {
  return withB2BCache('b2bdata', fetchB2BDataUncached);
}

async function fetchB2BDataUncached(): Promise<B2BData> {
  const inboundP = fetchInboundBoard();
  const outreachP = fetchOutreachLeads()
    .catch((e) => { console.error('[b2b] outreach aggregate fetch failed', e); return [] as OutreachLead[]; });
  const failed: B2BData['failed'] = [];
  const kamP = fetchKamOrders()
    .catch((e) => { console.error('[b2b] kam orders fetch failed', e); failed.push('kam'); return [] as KamOrder[]; });
  const clientsP = fetchClients()
    .catch((e) => { console.error('[b2b] client database fetch failed', e); failed.push('clients'); return [] as ClientEntity[]; });
  const [inbound, outreach, kam, clients] = await Promise.all([
    inboundP, outreachP, kamP, clientsP,
  ]);
  if (!inbound.ok) failed.push('inbound');
  return {
    inbound: inbound.leads, outreach, kam, clients,
    inboundTotal: inbound.total, failed,
  };
}

export async function fetchClients(): Promise<ClientEntity[]> {
  const rows = await fetchRows('client');
  return rows.map(rowToClient);
}

export async function fetchInboundLinks(): Promise<InboundLink[]> {
  const rows = await fetchRows('inbound');
  return rows.map((r) => ({
    id: String(r.kylas_lead_id ?? r.id),
    owner: r.owner || undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
    phones: [r.meta_data?.phone, r.meta_data?.primary_contact_phone].filter(Boolean).map(String),
  }));
}

export async function fetchKamOrders(): Promise<KamOrder[]> {
  const rows = await fetchRows('kam');
  return rows.map(rowToKamOrder);
}

export async function fetchOutreachLeads(
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<OutreachLead[]> {
  return (await fetchRows('outbound', opts)).map(rowToOutreach);
}

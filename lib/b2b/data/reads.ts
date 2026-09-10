import { rowToOutreach } from '../mappers/outreach';
import { withB2BCache } from './cache';
import { B2BLeadRow, B2B_FRESH_START, Pipeline, TABLE, floorToFreshStart } from './rows';
import { B2B_INBOUND_OWNER_LIST, fetchB2BInboundLeads } from '@/lib/api';
import { ClientEntity } from '@/components/b2b/models/client';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mock-data';
import { KamOrder } from '@/components/b2b/models/kam';
import { mergeKylasIntoRow, rowToInbound } from '../mappers/inbound';
import { rowToClient } from '../mappers/client';
import { rowToKamOrder } from '../mappers/kam';
import { supabase } from '@/lib/supabase';

function nextDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + 86_400_000).toISOString().slice(0, 10);
}

const ROW_PAGE = 1000;

function fetchAllRows(): Promise<B2BLeadRow[]> {
  return withB2BCache('rows|all', async () => {
    const all: B2BLeadRow[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * ROW_PAGE, page * ROW_PAGE + ROW_PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as B2BLeadRow[];
      all.push(...rows);
      if (rows.length < ROW_PAGE) return all;
    }
  });
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

interface InboundBoardPage {
  leads: InboundLead[];
  page: number;
  hasMore: boolean;
  total: number;
}

export async function fetchInboundBoard(
  opts?: {
    page?: number; ownerId?: number; search?: string;
    createdFrom?: string; createdTo?: string; kylasStage?: number;
  },
): Promise<InboundBoardPage> {
  const page = opts?.page ?? 0;
  const ownerIds = opts?.ownerId ? [opts.ownerId] : undefined;
  const search = (opts?.search || '').trim();
  const createdFrom = floorToFreshStart(opts?.createdFrom);
  const createdAfter = new Date(`${createdFrom}T00:00:00+05:30`).toISOString();
  const createdBefore = opts?.createdTo ? new Date(`${opts.createdTo}T23:59:59.999+05:30`).toISOString() : '';
  const kylas = await fetchB2BInboundLeads(
    page, ownerIds, search, createdAfter, createdBefore, opts?.kylasStage,
  );

  let dbLeads: InboundLead[] = [];
  if (page === 0 && !opts?.kylasStage) {
    try {

      const rows = await fetchRows('inbound', {
        createdFrom,
        createdTo: opts?.createdTo,
      });
      dbLeads = rows.map(rowToInbound);
      if (opts?.ownerId) dbLeads = dbLeads.filter((l) => l.ownerId === opts.ownerId);
      if (search) {
        const q = search.toLowerCase();
        dbLeads = dbLeads.filter((l) =>
          [l.company, l.companyName, l.contactName, l.phone].some((v) => (v || '').toLowerCase().includes(q)),
        );
      }
    } catch (e) {
      console.error('[b2b] inbound DB fetch failed (pre-migration?)', e);
    }
  }

  const kylasById = new Map(kylas.leads.map((k) => [k.id, k]));
  dbLeads = dbLeads.map((l) => {
    const fresh = kylasById.get(l.id);
    return fresh ? mergeKylasIntoRow(l, fresh) : l;
  });

  const kylasIds = new Set(kylas.leads.map((k) => k.id));
  dbLeads = dbLeads.filter((l) => l.stage !== 'New' || kylasIds.has(l.id));

  const dbIds = new Set(dbLeads.map((l) => l.id));
  return {
    leads: [...dbLeads, ...kylas.leads.filter((k) => !dbIds.has(k.id))],
    page: kylas.page,
    hasMore: kylas.hasMore,
    total: kylas.total,
  };
}

export interface B2BData {
  inbound: InboundLead[];
  outreach: OutreachLead[];

  kam: KamOrder[];

  clients: ClientEntity[];
  inboundTotal: number;
  inboundOwnerTotals: Record<string, number>;

  failed: ('inbound' | 'outreach' | 'kam' | 'clients')[];
}

export function fetchInboundOwnerTotals(): Promise<Record<string, number>> {
  return withB2BCache('inbound-owner-totals', fetchInboundOwnerTotalsUncached);
}

async function fetchInboundOwnerTotalsUncached(): Promise<Record<string, number>> {
  const since = new Date(`${B2B_FRESH_START}T00:00:00+05:30`).toISOString();
  const entries: (readonly [string, number])[] = [];
  for (const o of B2B_INBOUND_OWNER_LIST) {
    try {
      const res = await fetchB2BInboundLeads(0, [o.id], '', since, '', undefined, 1);
      entries.push([o.name, res.total] as const);
    } catch {
      entries.push([o.name, 0] as const);
    }
  }
  return Object.fromEntries(entries);
}

export async function fetchB2BData(): Promise<B2BData> {
  return withB2BCache('b2bdata', fetchB2BDataUncached);
}

async function fetchB2BDataUncached(): Promise<B2BData> {
  const inboundP = fetchInboundBoard()
    .then((p) => ({ leads: p.leads, total: p.total }))
    .catch((e) => { console.error('[b2b] inbound aggregate fetch failed', e); return { leads: [] as InboundLead[], total: 0 }; });
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
  if (!inbound.leads.length && !inbound.total) failed.push('inbound');
  return {
    inbound: inbound.leads, outreach, kam, clients,
    inboundTotal: inbound.total, inboundOwnerTotals: {}, failed,
  };
}

export async function fetchClients(): Promise<ClientEntity[]> {
  const rows = await fetchRows('client');
  return rows.map(rowToClient);
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

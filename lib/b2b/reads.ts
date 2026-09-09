import { rowToOutreach } from './outreachMapper';
import { B2BLeadRow, B2B_FRESH_START, Pipeline, TABLE, floorToFreshStart } from './rows';
import { B2B_INBOUND_OWNER_LIST, fetchB2BInboundLeads } from '@/lib/mockApi';
import { ClientEntity } from '@/components/b2b/models/clientModel';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mockData';
import { KamOrder } from '@/components/b2b/models/kamModel';
import { mergeKylasIntoRow, rowToInbound } from './inboundMapper';
import { rowToClient } from './clientMapper';
import { rowToKamOrder } from './kamMapper';
import { supabase } from '@/lib/supabase';
// ── Reads ────────────────────────────────────────────────────────────────────

// 'YYYY-MM-DD' + 1 day, as a string. Used to build a half-open upper bound.
function nextDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + 86_400_000).toISOString().slice(0, 10);
}

// createdFrom/createdTo are 'YYYY-MM-DD', both inclusive.
//
// created_at is a *text* column, so these are lexicographic comparisons — which
// match chronological order for ISO-8601-shaped strings. The range is half-open
// (`>= from`, `< to+1day`) rather than `<= to` so it is correct whether a value
// is day-only ('2026-08-06') or a full timestamp ('2026-08-06T18:00:00Z'):
// both sort below '2026-08-07'. A `<= '2026-08-06'` bound would drop the
// timestamped one, and a `<= '2026-08-06T23:59:59'` bound would drop the
// day-only one (a string sorts before its own longer extension).
export async function fetchRows(
  pipeline: Pipeline,
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<B2BLeadRow[]> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('pipeline', pipeline);
  if (opts?.createdFrom) query = query.gte('created_at', opts.createdFrom);
  if (opts?.createdTo) query = query.lt('created_at', nextDay(opts.createdTo));
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as B2BLeadRow[];
}

export interface InboundBoardPage {
  leads: InboundLead[];
  page: number;
  hasMore: boolean;
  total: number;
}

// Inbound board = promoted DB rows + Kylas "New" leads not yet in the DB.
// Paginated over the Kylas side; DB overlay is loaded once on the first page.
// createdFrom/createdTo are plain 'YYYY-MM-DD' days. The IST-anchored instants
// Kylas needs are derived here, so the two sides can't drift apart.
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

  // A New-stage filter is about the Kylas New pool only, so the DB overlay is
  // skipped entirely.
  let dbLeads: InboundLead[] = [];
  if (page === 0 && !opts?.kylasStage) {
    try {
      // Same created-date window Kylas applied to the New pool, so promoted
      // leads in the other columns honour the filter too. Applied in SQL against
      // the created_at column rather than a mapped field, so it doesn't depend on
      // the row mapper carrying a date through.
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
  // Refresh the Kylas half of every promoted row that this page also returned.
  // Without this a lead keeps rendering the §3.1 snapshot taken when it was
  // first dragged out of New — so a reassignment in Kylas, or a name Presales
  // corrected, never reaches the board.
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
  /**
   * KAM Active Orders (KAM PRD §5). Was `KamClient[]`, the old board's
   * client-and-order-in-one row; the KAM module split those apart, so the
   * orders are here and the client entities are in `clients`.
   */
  kam: KamOrder[];
  /** Client Database entities (Client DB PRD §2). Empty until the master is seeded. */
  clients: ClientEntity[];
  inboundTotal: number;                        // true Kylas total of "New" inbound leads (board only loads page 0)
  inboundOwnerTotals: Record<string, number>;  // New-stage count per owner name (for the leaderboard)
  /**
   * Which halves failed to load. A dashboard quietly showing only the inbound
   * half looks exactly like a CRM with no KAM orders — the same rule the Leads
   * tab follows.
   */
  failed: ('inbound' | 'outreach' | 'kam' | 'clients')[];
}

// Per-owner New-stage totals from Kylas (one light count query per inbound owner).
async function fetchInboundOwnerTotals(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    B2B_INBOUND_OWNER_LIST.map(async (o) => {
      try {
        const res = await fetchB2BInboundLeads(
          0, [o.id], '', new Date(`${B2B_FRESH_START}T00:00:00+05:30`).toISOString(),
        );
        return [o.name, res.total] as const;
      } catch {
        return [o.name, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// Aggregation feed for Dashboard / Leadership / Targets — one pull across all
// three pipelines. Inbound = full DB overlay + first page of Kylas "New" leads;
// inboundTotal / inboundOwnerTotals carry the real New-stage counts so the
// numbers don't reflect only page 0.
export async function fetchB2BData(): Promise<B2BData> {
  const inboundP = fetchInboundBoard()
    .then((p) => ({ leads: p.leads, total: p.total }))
    .catch((e) => { console.error('[b2b] inbound aggregate fetch failed', e); return { leads: [] as InboundLead[], total: 0 }; });
  const ownerTotalsP = fetchInboundOwnerTotals().catch(() => ({} as Record<string, number>));
  const outreachP = fetchOutreachLeads()
    .catch((e) => { console.error('[b2b] outreach aggregate fetch failed', e); return [] as OutreachLead[]; });
  const failed: B2BData['failed'] = [];
  const kamP = fetchKamOrders()
    .catch((e) => { console.error('[b2b] kam orders fetch failed', e); failed.push('kam'); return [] as KamOrder[]; });
  const clientsP = fetchClients()
    .catch((e) => { console.error('[b2b] client database fetch failed', e); failed.push('clients'); return [] as ClientEntity[]; });
  const [inbound, outreach, kam, clients, inboundOwnerTotals] = await Promise.all([
    inboundP, outreachP, kamP, clientsP, ownerTotalsP,
  ]);
  if (!inbound.leads.length && !inbound.total) failed.push('inbound');
  return {
    inbound: inbound.leads, outreach, kam, clients,
    inboundTotal: inbound.total, inboundOwnerTotals, failed,
  };
}
// ── Client Database reads ────────────────────────────────────────────────────

export async function fetchClients(): Promise<ClientEntity[]> {
  const rows = await fetchRows('client');
  return rows.map(rowToClient);
}

/** Every KAM Active Order (KAM PRD §5.3). */
export async function fetchKamOrders(): Promise<KamOrder[]> {
  const rows = await fetchRows('kam');
  return rows.map(rowToKamOrder);
}

export async function fetchOutreachLeads(
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<OutreachLead[]> {
  return (await fetchRows('outbound', opts)).map(rowToOutreach);
}

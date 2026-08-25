import { supabase } from '@/lib/supabase';
import {
  fetchB2BInboundLeads, B2B_INBOUND_OWNER_LIST, fetchCRMLeadsStats,
  fetchClientOrderHistoriesApi,
  type CRMLeadsStats, type CRMLeadsStatsBucket, type ClientOrderHistoryRow,
} from '@/lib/mockApi';
import {
  defaultTargetStore,
  type InboundLead, type InboundStage,
  type OutboundLead, type OutboundStage,
  type KamClient, type KamStage, type KamSource,
  type AccountType, type ProductCategory, type LeadNote,
  type TargetStore,
} from '@/components/b2b/mockData';
import type { Escalation } from '@/components/b2b/accountHealth';

type Pipeline = 'inbound' | 'outbound' | 'kam';

interface B2BLeadRow {
  id: string;
  pipeline: Pipeline;
  stage: string;
  kylas_lead_id: string | null;
  owner: string;
  value: number;
  meta_data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'b2b_lead';

// ── Mappers: row ↔ UI type ───────────────────────────────────────────────────

function rowToInbound(r: B2BLeadRow): InboundLead {
  const m = r.meta_data || {};
  return {
    id: r.kylas_lead_id || r.id,
    company: m.company || '',
    contactName: m.contact_name || '',
    phone: m.phone || '',
    owner: r.owner || '',
    ownerId: m.owner_kylas_id,
    accountType: (m.account_type as AccountType) || undefined,
    stage: r.stage as InboundStage,
    kylasStage: typeof m.kylas_stage === 'number' ? m.kylas_stage : undefined,
    source: m.source || 'Other',
    urgency: m.urgency || 'Planning',
    value: Number(r.value) || 0,
    timeline: m.timeline,
    requirementBrief: m.requirement_brief,
    requirement: m.requirement,
    categories: (m.categories as string[]) || [],
    expectedClosure: m.expected_closure || undefined,
    followUpDate: m.follow_up_date || undefined,
    followUpTime: m.follow_up_time || undefined,
    enqId: m.enq_id || undefined,
    piStatus: m.pi_status || undefined,
    lostReason: m.lost_reason || undefined,
    calls: [],
    notes: [],
  };
}

// Inbound DB row = stage overlay + card snapshot.
// Kylas is the source of truth for requirement/categories/closure; we also mirror
// them here so the board card stays populated and edits survive a failed Kylas push.
function inboundToRow(l: InboundLead): B2BLeadRow {
  return {
    id: l.id,
    pipeline: 'inbound',
    stage: l.stage,
    kylas_lead_id: l.id,
    owner: l.owner,
    value: l.value || 0,
    meta_data: {
      company: l.company,
      contact_name: l.contactName,
      phone: l.phone,
      owner_kylas_id: l.ownerId,
      account_type: l.accountType,
      kylas_stage: l.kylasStage,
      source: l.source,
      timeline: l.timeline || '',
      // Kylas-owned, mirrored here as a fallback
      requirement: l.requirement || '',
      requirement_brief: l.requirementBrief || '',
      categories: l.categories || [],
      expected_closure: l.expectedClosure || '',
      // stage-specific working fields (no Kylas home yet)
      follow_up_date: l.followUpDate || '',
      follow_up_time: l.followUpTime || '',
      enq_id: l.enqId || '',
      pi_status: l.piStatus || '',
      lost_reason: l.lostReason || '',
    },
  };
}

function rowToOutbound(r: B2BLeadRow): OutboundLead {
  const m = r.meta_data || {};
  return {
    id: r.id,
    company: m.company || '',
    contactName: m.contact_name || '',
    phone: m.phone || undefined,
    accountType: (m.account_type as AccountType) || 'Interior Designer',
    city: m.city || undefined,
    stage: r.stage as OutboundStage,
    bda: r.owner,
    segment: m.segment || 'Seg 1',
    visitCount: Number(m.visit_count) || 1,
    value: Number(r.value) || 0,
    expectedClosure: m.expected_closure || undefined,
    nextMeetingDate: m.next_meeting_date || undefined,
    nextMeetingTime: m.next_meeting_time || undefined,
    requirement: m.requirement || undefined,
    categories: (m.categories as ProductCategory[]) || [],
    notes: (m.notes as LeadNote[]) || [],
    enqId: m.enq_id || undefined,
    piValue: typeof m.pi_value === 'number' ? m.pi_value : undefined,
    piStatus: m.pi_status || undefined,
    lostReason: m.lost_reason || undefined,
  };
}

function outboundToRow(l: OutboundLead): B2BLeadRow {
  return {
    id: l.id,
    pipeline: 'outbound',
    stage: l.stage,
    kylas_lead_id: null,
    owner: l.bda,
    value: l.value || 0,
    meta_data: {
      company: l.company,
      contact_name: l.contactName,
      phone: l.phone || '',
      account_type: l.accountType,
      city: l.city || '',
      segment: l.segment,
      visit_count: l.visitCount,
      next_meeting_date: l.nextMeetingDate || '',
      next_meeting_time: l.nextMeetingTime || '',
      requirement: l.requirement || '',
      categories: l.categories || [],
      notes: l.notes || [],
      enq_id: l.enqId || '',
      pi_value: l.piValue ?? 0,
      pi_status: l.piStatus || '',
      lost_reason: l.lostReason || '',
    },
  };
}

function rowToKam(r: B2BLeadRow): KamClient {
  const m = r.meta_data || {};
  return {
    id: r.id,
    company: m.company || '',
    contactName: m.contact_name || '',
    phone: m.phone || '',
    enqId: m.enq_id || undefined,
    value: Number(r.value) || 0,
    expectedClosure: m.expected_closure || undefined,
    stage: r.stage as KamStage,
    kam: r.owner,
    source: (m.source as KamSource) || 'Existing',
    notes: (m.notes as LeadNote[]) || [],
    escalations: (m.escalations as Escalation[]) || [],
  };
}

function kamToRow(l: KamClient): B2BLeadRow {
  return {
    id: l.id,
    pipeline: 'kam',
    stage: l.stage,
    kylas_lead_id: null,
    owner: l.kam,
    value: l.value || 0,
    meta_data: {
      company: l.company,
      contact_name: l.contactName,
      phone: l.phone,
      enq_id: l.enqId || '',
      source: l.source,
      expected_closure: l.expectedClosure || '',
      notes: l.notes || [],
      escalations: l.escalations || [],
    },
  };
}

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
async function fetchRows(
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
  const createdAfter = opts?.createdFrom ? new Date(`${opts.createdFrom}T00:00:00+05:30`).toISOString() : '';
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
        createdFrom: opts?.createdFrom,
        createdTo: opts?.createdTo,
      });
      dbLeads = rows.map(rowToInbound);
      if (opts?.ownerId) dbLeads = dbLeads.filter((l) => l.ownerId === opts.ownerId);
      if (search) {
        const q = search.toLowerCase();
        dbLeads = dbLeads.filter((l) =>
          [l.company, l.contactName, l.phone].some((v) => (v || '').toLowerCase().includes(q)),
        );
      }
    } catch (e) {
      console.error('[b2b] inbound DB fetch failed (pre-migration?)', e);
    }
  }
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
  outbound: OutboundLead[];
  kam: KamClient[];
  inboundTotal: number;                        // true Kylas total of "New" inbound leads (board only loads page 0)
  inboundOwnerTotals: Record<string, number>;  // New-stage count per owner name (for the leaderboard)
}

// Per-owner New-stage totals from Kylas (one light count query per inbound owner).
async function fetchInboundOwnerTotals(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    B2B_INBOUND_OWNER_LIST.map(async (o) => {
      try {
        const res = await fetchB2BInboundLeads(0, [o.id]);
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
  const [inbound, outbound, kam, inboundOwnerTotals] = await Promise.all([
    inboundP, fetchOutboundLeads(), fetchKamClients(), ownerTotalsP,
  ]);
  return { inbound: inbound.leads, outbound, kam, inboundTotal: inbound.total, inboundOwnerTotals };
}

// ── Pipeline value (Django /crm/leads/stats/, branch = B2B) ───────────────────
// Cart value lives on the Django estimates/tickets, not in b2b_lead — so every
// rupee on the dashboard comes from the same endpoint the Leads tab strip uses,
// scoped to the B2B branch. b2b_lead only drives stage counts and ownership.

export const B2B_BRANCH = 'B2B';

export interface B2BPipelineStats {
  total: CRMLeadsStatsBucket;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
  lost: CRMLeadsStatsBucket;
  byStatus: CRMLeadsStats['byStatus'];
}

const EMPTY_BUCKET: CRMLeadsStatsBucket = { count: 0, value: 0 };

// 'YYYY-MM-DD' for the current Indian day — the API filters on IST dates.
export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Created-date window, both ends inclusive and optional. Omit both for all-time.
// Same parameters the Leads tab sends, so a B2B-filtered Leads tab and this
// dashboard report identical numbers for identical windows.
export async function fetchB2BPipelineStats(
  range?: { from?: string; to?: string },
): Promise<B2BPipelineStats> {
  const stats = await fetchCRMLeadsStats({
    branch: B2B_BRANCH, createdFrom: range?.from, createdTo: range?.to,
  }).catch((e) => { console.error('[b2b] leads stats fetch failed', e); return null; });
  return {
    total: stats?.total ?? EMPTY_BUCKET,
    active: stats?.active ?? EMPTY_BUCKET,
    won: stats?.won ?? EMPTY_BUCKET,
    lost: stats?.lost ?? EMPTY_BUCKET,
    byStatus: stats?.byStatus ?? [],
  };
}

// ── Client order history (lifetime, from Django deal tickets) ─────────────────
// One batched request for the whole board via /crm/leads/client-order-history/.
// That endpoint groups deal tickets by client in two indexed queries and reuses
// the same status/value derivation as /crm/leads/stats/, so a KAM card can never
// disagree with the Leads tab for the same client.

export interface ClientOrderHistory {
  orders: number;         // won deal count, all time
  lifetimeValue: number;  // won deal value, all time
  openValue: number;      // still-active pipeline for this client
  enquiries: number;      // every deal ever raised, won or not
  enquiryValue: number;   // value of every deal ever raised
  furthestStatus: string | null;  // furthest-progressed deal status, drives auto-advance
}

// Last 10 digits, so '+91 99000 99013' and '9900099013' resolve to one client.
export function normalizeClientPhone(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

// Module-level, so re-entering the tab doesn't refetch what we already have.
const orderHistoryCache = new Map<string, ClientOrderHistory>();

// The backend caps a request at 300 phones; chunk so a large board still works.
const HISTORY_BATCH = 300;

export async function fetchClientOrderHistories(
  phones: (string | undefined)[],
): Promise<Record<string, ClientOrderHistory>> {
  const wanted = [...new Set(phones.map(normalizeClientPhone).filter((k) => k.length === 10))];
  const out: Record<string, ClientOrderHistory> = {};
  const missing: string[] = [];
  for (const key of wanted) {
    const cached = orderHistoryCache.get(key);
    if (cached) out[key] = cached; else missing.push(key);
  }
  if (!missing.length) return out;

  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += HISTORY_BATCH) batches.push(missing.slice(i, i + HISTORY_BATCH));

  const settled = await Promise.all(
    batches.map((batch) =>
      fetchClientOrderHistoriesApi(batch).catch((e) => {
        console.error('[b2b] client order history fetch failed', e);
        return {} as Record<string, ClientOrderHistoryRow>;
      }),
    ),
  );

  for (const batch of settled) {
    for (const [key, row] of Object.entries(batch)) {
      const history: ClientOrderHistory = {
        orders: Number(row.orders) || 0,
        lifetimeValue: Number(row.lifetimeValue) || 0,
        openValue: Number(row.openValue) || 0,
        enquiries: Number(row.enquiries) || 0,
        enquiryValue: Number(row.enquiryValue) || 0,
        furthestStatus: row.furthestStatus ?? null,
      };
      // Key on the normalized phone, not the backend's raw contact string.
      const normalized = normalizeClientPhone(key);
      orderHistoryCache.set(normalized, history);
      out[normalized] = history;
    }
  }
  // A phone the backend returned nothing for has no deal tickets at all. Cache
  // that as a real zero, so it isn't re-requested on every board render.
  for (const key of missing) {
    if (!out[key]) {
      const zero: ClientOrderHistory = { orders: 0, lifetimeValue: 0, openValue: 0, enquiries: 0, enquiryValue: 0, furthestStatus: null };
      orderHistoryCache.set(key, zero);
      out[key] = zero;
    }
  }
  return out;
}

export interface VerticalRep { name: string; contact: string }

export const B2B_VERTICALS: { label: string; reps: VerticalRep[] }[] = [
  { label: 'Bangalore KAM', reps: [
    { name: 'Tharun', contact: '8309230101' },
    { name: 'Krishna Jadhav', contact: '9187200807' },
  ] },
  { label: 'Inbound', reps: [
    { name: 'Mandeep Ghai', contact: '7223048042' },
    { name: 'Hardi Patel', contact: '9187191018' },
  ] },
  { label: 'Outbound', reps: [
    { name: 'Vilok Reddy', contact: '9980123308' },
    { name: 'Prafful Bhati', contact: '8233435000' },
  ] },
  { label: 'HYD', reps: [
    { name: 'Manikanta', contact: '9059903118' },
    { name: 'Shahrukh Irshad Ali', contact: '9187200815' },
  ] },
];

// One call per vertical carries both buckets: `active` is that vertical's open
// pipeline, `won` is its realised revenue. Both panels read the same fetch, so
// pipeline and revenue can never be scoped differently.
export interface VerticalStats {
  label: string;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
}

export async function fetchVerticalStats(
  range?: { from?: string; to?: string },
): Promise<VerticalStats[]> {
  return Promise.all(
    B2B_VERTICALS.map(async (v) => {
      const stats = await fetchCRMLeadsStats({
        bm: v.reps.map((r) => r.contact).join(','),
        createdFrom: range?.from,
        createdTo: range?.to,
      }).catch((e) => {
        console.error(`[b2b] vertical stats fetch failed (${v.label})`, e);
        return null;
      });
      return {
        label: v.label,
        active: stats?.active ?? EMPTY_BUCKET,
        won: stats?.won ?? EMPTY_BUCKET,
      };
    }),
  );
}

export async function fetchOutboundLeads(
  opts?: { createdFrom?: string; createdTo?: string },
): Promise<OutboundLead[]> {
  try {
    return (await fetchRows('outbound', opts)).map(rowToOutbound);
  } catch (e) {
    console.error('[b2b] outbound DB fetch failed', e);
    return [];
  }
}

export async function fetchKamClients(): Promise<KamClient[]> {
  try {
    return (await fetchRows('kam')).map(rowToKam);
  } catch (e) {
    console.error('[b2b] kam DB fetch failed', e);
    return [];
  }
}

// ── Writes (never throw to the UI; resolve to an error message or null) ───────
// Fire-and-forget callers can keep ignoring the result. Bulk import awaits it,
// because "imported 40 clients" is a lie if the upserts silently failed.

async function upsert(row: B2BLeadRow, onConflict: string): Promise<string | null> {
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict });
    if (error) throw error;
    return null;
  } catch (e) {
    console.error('[b2b] upsert failed', e);
    return e instanceof Error ? e.message : String(e);
  }
}

export function upsertInboundLead(l: InboundLead): Promise<string | null> {
  return upsert(inboundToRow(l), 'kylas_lead_id');
}

export function upsertOutboundLead(l: OutboundLead): Promise<string | null> {
  return upsert(outboundToRow(l), 'id');
}

export function upsertKamClient(l: KamClient): Promise<string | null> {
  return upsert(kamToRow(l), 'id');
}

// ── Targets (shared team goals; single config row) ────────────────────────────

const TARGET_TABLE = 'b2b_target';
const TARGET_ROW_ID = 'default';

export async function fetchTargets(): Promise<TargetStore> {
  const base = defaultTargetStore();
  try {
    const { data, error } = await supabase
      .from(TARGET_TABLE)
      .select('monthly_target_l, reps')
      .eq('id', TARGET_ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) return base;
    return {
      monthlyTargetL: Number(data.monthly_target_l) || base.monthlyTargetL,
      reps: { ...base.reps, ...((data.reps as TargetStore['reps']) || {}) },
    };
  } catch (e) {
    console.error('[b2b] fetch targets failed (pre-migration?)', e);
    return base;
  }
}

export async function saveTargets(store: TargetStore): Promise<void> {
  try {
    const { error } = await supabase.from(TARGET_TABLE).upsert(
      { id: TARGET_ROW_ID, monthly_target_l: store.monthlyTargetL, reps: store.reps, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
    if (error) throw error;
  } catch (e) {
    console.error('[b2b] save targets failed', e);
  }
}

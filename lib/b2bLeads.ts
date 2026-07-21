import { supabase } from '@/lib/supabase';
import { fetchB2BInboundLeads } from '@/lib/mockApi';
import {
  OUTBOUND_LEADS, KAM_CLIENTS,
  type InboundLead, type InboundStage, type Priority,
  type OutboundLead, type OutboundStage,
  type KamClient, type KamStage, type KamSource,
  type AccountType, type ProductCategory, type LeadNote,
} from '@/app/b2b/mockData';

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
    accountType: (m.account_type as AccountType) || 'Retailer',
    stage: r.stage as InboundStage,
    priority: (m.priority as Priority) || 'Medium',
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
      priority: l.priority,
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
    },
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function fetchRows(pipeline: Pipeline): Promise<B2BLeadRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('pipeline', pipeline)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as B2BLeadRow[];
}

// Inbound board = promoted DB rows + Kylas "New" leads not yet in the DB.
export async function fetchInboundBoard(): Promise<InboundLead[]> {
  const kylasNew = await fetchB2BInboundLeads();
  let dbLeads: InboundLead[] = [];
  try {
    dbLeads = (await fetchRows('inbound')).map(rowToInbound);
  } catch (e) {
    console.error('[b2b] inbound DB fetch failed (pre-migration?)', e);
  }
  const dbIds = new Set(dbLeads.map((l) => l.id));
  return [...dbLeads, ...kylasNew.filter((k) => !dbIds.has(k.id))];
}

export async function fetchOutboundLeads(): Promise<OutboundLead[]> {
  try {
    return (await fetchRows('outbound')).map(rowToOutbound);
  } catch (e) {
    console.error('[b2b] outbound DB fetch failed (pre-migration?), using seed', e);
    return OUTBOUND_LEADS;
  }
}

export async function fetchKamClients(): Promise<KamClient[]> {
  try {
    return (await fetchRows('kam')).map(rowToKam);
  } catch (e) {
    console.error('[b2b] kam DB fetch failed (pre-migration?), using seed', e);
    return KAM_CLIENTS;
  }
}

// ── Writes (best-effort; never throw to the UI) ──────────────────────────────

async function upsert(row: B2BLeadRow, onConflict: string): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict });
    if (error) throw error;
  } catch (e) {
    console.error('[b2b] upsert failed', e);
  }
}

export function upsertInboundLead(l: InboundLead): Promise<void> {
  return upsert(inboundToRow(l), 'kylas_lead_id');
}

export function upsertOutboundLead(l: OutboundLead): Promise<void> {
  return upsert(outboundToRow(l), 'id');
}

export function upsertKamClient(l: KamClient): Promise<void> {
  return upsert(kamToRow(l), 'id');
}

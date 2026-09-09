
import { B2BPipelineStats, EMPTY_BUCKET } from '../stats/pipeline';
import { TABLE } from '../data/rows';
import { CRMLeadsStats, CRMLeadsStatsBucket, fetchCRMLeadsStatsByBmGroup } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export async function fetchKamLoad(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('meta_data')
      .in('pipeline', ['inbound', 'outbound'])
      .eq('stage', 'Closed');
    if (error) throw error;
    const load: Record<string, number> = {};
    for (const row of (data || []) as { meta_data?: Record<string, any> }[]) {
      const kam = String(row.meta_data?.kam || '').trim();
      if (kam) load[kam] = (load[kam] || 0) + 1;
    }
    return load;
  } catch (e) {
    console.error('[b2b] kam load fetch failed', e);
    return {};
  }
}

export const fetchInboundKamLoad = fetchKamLoad;

interface VerticalRep { name: string; contact: string }

const B2B_VERTICALS: { label: string; reps: VerticalRep[] }[] = [
  { label: 'Bangalore KAM', reps: [
    { name: 'Tharun', contact: '8309230101' },
    { name: 'Krishna Jadhav', contact: '9187200807' },
  ] },
  { label: 'Inbound', reps: [
    { name: 'Mandeep Ghai', contact: '7223048042' },
    { name: 'Hardi Patel', contact: '9187191018' },
  ] },
  { label: 'Outreach', reps: [
    { name: 'Vilok Reddy', contact: '9980123308' },
    { name: 'Prafful Bhati', contact: '8233435000' },
  ] },
  { label: 'HYD', reps: [
    { name: 'Manikanta', contact: '9059903118' },
    { name: 'Shahrukh Irshad Ali', contact: '9187200815' },
  ] },
];

export interface VerticalStats {
  label: string;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
}

export interface VerticalStatsResult {
  verticals: VerticalStats[];

  pipeline: B2BPipelineStats | null;
}

export async function fetchVerticalStats(
  range?: { from?: string; to?: string },
  totalBranch?: string,
): Promise<VerticalStatsResult> {
  const res = await fetchCRMLeadsStatsByBmGroup(
    B2B_VERTICALS.map((v) => ({ label: v.label, contacts: v.reps.map((r) => r.contact) })),
    { createdFrom: range?.from, createdTo: range?.to },
    totalBranch,
  ).catch((e) => {
    console.error('[b2b] vertical stats fetch failed', e);
    return { groups: {} as Record<string, CRMLeadsStats>, branchTotal: null };
  });

  const byLabel = res.groups;
  const t = res.branchTotal;
  return {
    verticals: B2B_VERTICALS.map((v) => ({
      label: v.label,
      active: byLabel[v.label]?.active ?? EMPTY_BUCKET,
      won: byLabel[v.label]?.won ?? EMPTY_BUCKET,
    })),
    pipeline: t
      ? { total: t.total, active: t.active, won: t.won, lost: t.lost, byStatus: t.byStatus }
      : null,
  };
}


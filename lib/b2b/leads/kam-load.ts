
import { B2BPipelineStats, EMPTY_BUCKET } from '../stats/pipeline';
import { TABLE } from '../data/rows';
import { B2B_VERTICALS } from '@/components/b2b/models/roster';
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

export interface VerticalStats {
  label: string;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
}

export interface VerticalStatsResult {
  verticals: VerticalStats[];

  pipeline: B2BPipelineStats | null;

  ok: boolean;
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
    return { groups: null as Record<string, CRMLeadsStats> | null, branchTotal: null };
  });

  const byLabel = res.groups ?? {};
  const t = res.branchTotal;
  return {
    verticals: B2B_VERTICALS.map((v) => ({
      label: v.label,
      active: byLabel[v.label]?.active ?? EMPTY_BUCKET,
      won: byLabel[v.label]?.won ?? EMPTY_BUCKET,
    })),
    pipeline: t
      ? { total: t.total, active: t.active, won: t.won, lost: t.lost, byStatus: t.byStatus, ok: true }
      : null,
    ok: res.groups !== null,
  };
}


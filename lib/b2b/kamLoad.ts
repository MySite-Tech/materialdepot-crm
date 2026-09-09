import { rowToOutreach } from './outreachMapper';
import { EMPTY_BUCKET } from './pipelineStats';
import { fetchRows } from './reads';
import { TABLE } from './rows';
import { OutreachLead } from '@/components/b2b/models/mockData';
import { CRMLeadsStatsBucket, fetchCRMLeadsStats } from '@/lib/mockApi';
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


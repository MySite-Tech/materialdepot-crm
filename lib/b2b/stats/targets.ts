import { TargetStore, defaultTargetStore } from '@/components/b2b/models/mock-data';
import { supabase } from '@/lib/supabase';
import { invalidateB2BCache, withB2BCache } from '../data/cache';
const TARGET_TABLE = 'b2b_target';
const TARGET_ROW_ID = 'default';

export async function fetchTargets(): Promise<TargetStore> {
  return withB2BCache('targets', fetchTargetsUncached);
}

async function fetchTargetsUncached(): Promise<TargetStore> {
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
    invalidateB2BCache();
  } catch (e) {
    console.error('[b2b] save targets failed', e);
  }
}


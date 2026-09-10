import { TargetStore, defaultTargetStore } from '@/components/b2b/models/mock-data';
import { supabase } from '@/lib/supabase';
import { invalidateB2BCache, withB2BCache } from '../data/cache';
const TARGET_TABLE = 'b2b_target';
const TARGET_ROW_ID = 'default';

export interface TargetsResult {
  store: TargetStore;

  ok: boolean;
}

export async function fetchTargets(): Promise<TargetsResult> {
  return withB2BCache('targets', fetchTargetsUncached);
}

async function fetchTargetsUncached(): Promise<TargetsResult> {
  const base = defaultTargetStore();
  try {
    const { data, error } = await supabase
      .from(TARGET_TABLE)
      .select('monthly_target_l, reps')
      .eq('id', TARGET_ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { store: base, ok: true };
    return {
      store: {
        monthlyTargetL: Number(data.monthly_target_l) || base.monthlyTargetL,
        reps: { ...base.reps, ...((data.reps as TargetStore['reps']) || {}) },
      },
      ok: true,
    };
  } catch (e) {
    console.error('[b2b] fetch targets failed (pre-migration?)', e);
    return { store: base, ok: false };
  }
}

export async function saveTargets(store: TargetStore): Promise<string | null> {
  try {
    const { error } = await supabase.from(TARGET_TABLE).upsert(
      { id: TARGET_ROW_ID, monthly_target_l: store.monthlyTargetL, reps: store.reps, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
    if (error) throw error;
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] save targets failed', e);
    return e instanceof Error && e.message ? e.message : String(e);
  }
}


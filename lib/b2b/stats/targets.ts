import { TargetStore, defaultTargetStore } from '@/components/b2b/models/mock-data';
import { b2bBackendGet, b2bBackendPost } from '../data/backend';
import { invalidateB2BCache, withB2BCache } from '../data/cache';

const TARGET_ROW_ID = 'default';

interface TargetRow {
  monthly_target_l?: number;
  reps?: TargetStore['reps'];
}

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
    const data = await b2bBackendGet<TargetRow | null>('/target');
    if (!data) return { store: base, ok: true };
    return {
      store: {
        monthlyTargetL: Number(data.monthly_target_l) || base.monthlyTargetL,
        reps: { ...base.reps, ...(data.reps || {}) },
      },
      ok: true,
    };
  } catch (e) {
    console.error('[b2b] fetch targets failed', e);
    return { store: base, ok: false };
  }
}

export async function saveTargets(store: TargetStore): Promise<string | null> {
  try {
    await b2bBackendPost('/target', {
      id: TARGET_ROW_ID,
      monthly_target_l: store.monthlyTargetL,
      reps: store.reps,
    });
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] save targets failed', e);
    return e instanceof Error && e.message ? e.message : String(e);
  }
}


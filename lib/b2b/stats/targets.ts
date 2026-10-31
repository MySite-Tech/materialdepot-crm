import type { Goals, TargetStore } from '@/components/b2b/models/performance/types';
import { b2bBackendGet, b2bBackendPost } from '../data/backend';
import { invalidateB2BCache, withB2BCache } from '../data/cache';

const TARGET_ROW_ID = 'default';

const B2B_MONTHLY_TARGET_L = 120;

interface TargetRow {
  monthly_target_l?: number;
  reps?: Record<string, unknown>;
}

export interface TargetsResult {
  store: TargetStore;

  ok: boolean;
}

const defaultTargetStore = (): TargetStore => ({ monthlyTargetL: B2B_MONTHLY_TARGET_L, goals: {} });

function parseGoals(reps: Record<string, unknown> | undefined): Goals {
  const out: Goals = {};
  for (const [key, raw] of Object.entries(reps || {})) {
    if (!key.includes('|') || !raw || typeof raw !== 'object') continue;
    const kpis = Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
    if (kpis.length) out[key] = Object.fromEntries(kpis) as Record<string, number>;
  }
  return out;
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
      store: { monthlyTargetL: Number(data.monthly_target_l) || base.monthlyTargetL, goals: parseGoals(data.reps) },
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
      reps: store.goals,
    });
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] save targets failed', e);
    return e instanceof Error && e.message ? e.message : String(e);
  }
}

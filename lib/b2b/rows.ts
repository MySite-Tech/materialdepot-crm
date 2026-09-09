// 'client' is the Client Database's pipeline value. `pipeline` is plain text
// with NO CHECK constraint — verified 2026-09-08 by inserting and deleting a
// probe row with pipeline='client' against the live CRM project. (Note for
// anyone repeating that: this Supabase does NOT honour `Prefer: tx=rollback`,
// so the probe row persisted and had to be deleted by id.)
export type Pipeline = 'inbound' | 'outbound' | 'kam' | 'client';

export interface B2BLeadRow {
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

export const TABLE = 'b2b_lead';

// Fresh-start floor. The B2B board was reset on this date: every b2b_lead row
// created before it was deleted, and Kylas — which still holds years of older
// inbound leads — must never surface them again. Every inbound read is clamped
// to this day, so a cleared or widened date filter cannot reach behind it.
export const B2B_FRESH_START = '2026-08-26';

// The later of `day` and the fresh-start floor. Empty/invalid input yields the
// floor itself, so "no filter" still means "from the reset onwards".
export function floorToFreshStart(day?: string): string {
  return day && day > B2B_FRESH_START ? day : B2B_FRESH_START;
}

export type MetaSpec<T> = {
  [K in keyof T]?: {
    /** meta_data key. */
    col: string;
    read: (v: any) => T[K];
  };
};

export const str = (v: any): string | undefined => {
  const s = String(v ?? '').trim();
  return s || undefined;
};
export const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
export const arr = <T,>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : []);

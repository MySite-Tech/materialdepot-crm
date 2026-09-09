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

export const B2B_FRESH_START = '2026-08-26';

export function floorToFreshStart(day?: string): string {
  return day && day > B2B_FRESH_START ? day : B2B_FRESH_START;
}

export type MetaSpec<T> = {
  [K in keyof T]?: {

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

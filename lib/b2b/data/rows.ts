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

export interface InboundRowChange {
  stage?: string;
  owner?: string;
  value?: number;
  meta: Record<string, unknown>;
  append: Record<string, unknown[]>;
}

export const B2B_FRESH_START = '2026-08-26';

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

export const pairTime = (date: string | undefined, time: string | undefined): string | null => {
  const d = String(date || '').slice(0, 10);
  const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')) ? String(time) : '';
  return d && t ? `${d}T${t}` : null;
};

export const unpairTime = (stored: unknown, date: string | undefined): string | undefined => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(stored ?? ''));
  return m && m[1] === String(date || '').slice(0, 10) ? m[2] : undefined;
};

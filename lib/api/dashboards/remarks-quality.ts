import { mdFetch } from '../core/client';

export type RemarksDictName = 'person' | 'branch' | 'type' | 'status' | 'prio' | 'cats' | 'date' | 'rk';
export type PointerPatternKey = 'need' | 'stuck' | 'who' | 'date' | 'nextl' | 'act';

export interface RemarksQualityPayload {
  generated: string;
  days: number;
  cols: string[];
  dicts: Record<RemarksDictName, string[]>;
  rows: Array<Array<number | string | null>>;
  rx: Record<PointerPatternKey, string>;
  att: { cols: string[]; rows: Array<Array<number | string>> };
}

export interface LeadHistoryEvent {
  at_ist: string;
  kind: 'remark' | 'ticket' | 'owner' | 'visit' | 'quote' | 'order';
  who: string | null;
  sub: string | null;
  detail: string | null;
  amt: number | null;
}

export const REMARK_TEXTS_BATCH = 400;
const DATASET_TTL_MS = 10 * 60 * 1000;

let dataset: { scope: string; at: number; p: Promise<RemarksQualityPayload> } | null = null;
const history = new Map<string, Promise<{ lead: string; events: LeadHistoryEvent[] }>>();

export function fetchRemarksQuality(scope: string, fresh = false): Promise<RemarksQualityPayload> {
  if (!fresh && dataset?.scope === scope && Date.now() - dataset.at < DATASET_TTL_MS) return dataset.p;
  history.clear();
  const p: Promise<RemarksQualityPayload> = mdFetch(`/crm/remarks-quality/${fresh ? '?fresh=1' : ''}`);
  dataset = { scope, at: Date.now(), p };
  p.catch(() => { if (dataset?.p === p) dataset = null; });
  return p;
}

export async function fetchRemarkTexts(ids: number[]): Promise<Record<string, string>> {
  return mdFetch(`/crm/remarks-quality/texts/?ids=${ids.slice(0, REMARK_TEXTS_BATCH).join(',')}`);
}

export function fetchLeadHistory(cartNumber: string): Promise<{ lead: string; events: LeadHistoryEvent[] }> {
  const hit = history.get(cartNumber);
  if (hit) return hit;
  const p: Promise<{ lead: string; events: LeadHistoryEvent[] }> = mdFetch(`/crm/remarks-quality/lead-history/?lead=${encodeURIComponent(cartNumber)}`);
  history.set(cartNumber, p);
  p.catch(() => { if (history.get(cartNumber) === p) history.delete(cartNumber); });
  return p;
}

import { clientToRow } from '../mappers/client';
import { inboundToRow } from '../mappers/inbound';
import { kamOrderToRow } from '../mappers/kam';
import { outreachToRow } from '../mappers/outreach';
import { B2BLeadRow, Pipeline } from './rows';
import { b2bBackendDelete, b2bBackendPost } from './backend';
import { ClientEntity } from '@/components/b2b/models/client';
import { KamOrder } from '@/components/b2b/models/kam';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mock-data';
import { invalidateB2BCache } from './cache';

function writeErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object') {
    const err = e as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [err.message, err.details, err.hint].filter(Boolean);
    const text = parts.join(' — ');
    if (text) return err.code ? `${text} (${err.code})` : text;
    if (err.code) return `Postgres error ${err.code}`;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json;
    } catch { /* circular — fall through */ }
  }
  return String(e);
}

async function upsert(row: B2BLeadRow): Promise<string | null> {
  try {
    await b2bBackendPost('/rows', row);
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] upsert failed', e);
    return writeErrorMessage(e);
  }
}

export function upsertInboundLead(l: InboundLead): Promise<string | null> {
  return upsert(inboundToRow(l));
}

export function upsertOutreachLead(l: OutreachLead): Promise<string | null> {
  return upsert(outreachToRow(l));
}

export async function upsertOutreachLeads(list: OutreachLead[], opts?: { onlyNew?: boolean }): Promise<string | null> {
  if (!list.length) return null;
  try {
    await b2bBackendPost('/rows/bulk', { rows: list.map(outreachToRow), only_new: !!opts?.onlyNew });
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] bulk outreach upsert failed', e);
    return writeErrorMessage(e);
  }
}

export function upsertClient(c: ClientEntity): Promise<string | null> {
  return upsert(clientToRow({ ...c, updatedAt: new Date().toISOString() }));
}

export function upsertKamOrder(o: KamOrder): Promise<string | null> {
  return upsert(kamOrderToRow(o));
}

export async function deleteB2BRow(id: string, pipeline: Pipeline = 'client'): Promise<string | null> {
  try {
    await b2bBackendDelete(`/rows/${encodeURIComponent(id)}?pipeline=${pipeline}`);
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] delete failed', e);
    return writeErrorMessage(e);
  }
}


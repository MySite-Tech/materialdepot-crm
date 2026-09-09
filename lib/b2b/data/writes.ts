import { clientToRow } from '../mappers/client';
import { inboundToRow } from '../mappers/inbound';
import { kamOrderToRow } from '../mappers/kam';
import { outreachToRow } from '../mappers/outreach';
import { B2BLeadRow, TABLE } from './rows';
import { ClientEntity } from '@/components/b2b/models/client';
import { KamOrder } from '@/components/b2b/models/kam';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mock-data';
import { supabase } from '@/lib/supabase';
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

async function upsert(row: B2BLeadRow, onConflict: string): Promise<string | null> {
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict });
    if (error) throw error;
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] upsert failed', e);
    return writeErrorMessage(e);
  }
}

export function upsertInboundLead(l: InboundLead): Promise<string | null> {
  return upsert(inboundToRow(l), 'kylas_lead_id');
}

export function upsertOutreachLead(l: OutreachLead): Promise<string | null> {
  return upsert(outreachToRow(l), 'id');
}

export function upsertClient(c: ClientEntity): Promise<string | null> {
  return upsert(clientToRow({ ...c, updatedAt: new Date().toISOString() }), 'id');
}

export function upsertKamOrder(o: KamOrder): Promise<string | null> {
  return upsert(kamOrderToRow(o), 'id');
}

export async function deleteB2BRow(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    invalidateB2BCache();
    return null;
  } catch (e) {
    console.error('[b2b] delete failed', e);
    return writeErrorMessage(e);
  }
}


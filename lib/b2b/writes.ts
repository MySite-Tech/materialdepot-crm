import { clientToRow } from './clientMapper';
import { inboundToRow } from './inboundMapper';
import { kamOrderToRow } from './kamMapper';
import { outreachToRow } from './outreachMapper';
import { B2BLeadRow, TABLE } from './rows';
import { ClientEntity } from '@/components/b2b/models/clientModel';
import { KamOrder } from '@/components/b2b/models/kamModel';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mockData';
import { supabase } from '@/lib/supabase';
// ── Writes (never throw to the UI; resolve to an error message or null) ───────
// Fire-and-forget callers can keep ignoring the result. Bulk import awaits it,
// because "imported 40 clients" is a lie if the upserts silently failed.

/**
 * A PostgrestError is a plain object, not an `Error`, so `String(e)` on one
 * yields the literal text "[object Object]" — which is what a rep saw when a
 * write failed. Pull out the fields Postgres actually sends. `code` matters
 * most: 42703 is the missing-column signature this repo hits every time a
 * migration has not been run.
 */
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

export async function upsert(row: B2BLeadRow, onConflict: string): Promise<string | null> {
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict });
    if (error) throw error;
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

/**
 * Delete one b2b_lead row. Used ONLY to remove the records absorbed by a merge,
 * once the surviving entity has been written — never for a client a user
 * "removed", because the orders behind it do not go away and an entity that
 * vanishes takes its interaction log with it.
 *
 * Returns an error message rather than throwing, and the merge flow reports it:
 * a merge whose survivor was written but whose sources were not deleted leaves
 * duplicates on screen, which the user has to be told about rather than
 * discovering on the next load.
 */
export async function deleteB2BRow(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    return null;
  } catch (e) {
    console.error('[b2b] delete failed', e);
    return writeErrorMessage(e);
  }
}

// ── Targets (shared team goals; single config row) ────────────────────────────


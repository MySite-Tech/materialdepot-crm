import { B2BBackendError, b2bBackendFetch } from '@/lib/server/b2b-backend';
import type { B2BLeadRow, InboundRowChange } from '@/lib/b2b/data/rows';
import { applyInboundChange } from '@/lib/b2b/mappers/inbound';

export interface InboundWrite {
  id: string;
  change: InboundRowChange;
  fallback?: B2BLeadRow;
}

const leadId = (r: B2BLeadRow) => String(r.kylas_lead_id || r.id);

let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export async function readInboundRows(): Promise<Map<string, B2BLeadRow>> {
  const rows = await b2bBackendFetch<B2BLeadRow[]>('/rows');
  return new Map(rows.filter((r) => r.pipeline === 'inbound').map((r) => [leadId(r), r]));
}

const NO_ROW = 'No such row';

async function changeRow(w: InboundWrite): Promise<B2BLeadRow | 'no-row' | 'no-route'> {
  try {
    const { row } = await b2bBackendFetch<{ row: B2BLeadRow }>(
      `/rows/${encodeURIComponent(w.id)}/change?pipeline=inbound`,
      { method: 'POST', body: w.change },
    );
    return row;
  } catch (e) {
    if (!(e instanceof B2BBackendError) || e.status !== 404) throw e;
    return e.message === NO_ROW ? 'no-row' : 'no-route';
  }
}

export function writeInbound(writes: InboundWrite[]): Promise<{ rows: B2BLeadRow[]; missing: string[] }> {
  return oneAtATime(async () => {
    const rows: B2BLeadRow[] = [];
    const missing: string[] = [];
    let current: Map<string, B2BLeadRow> | null = null;
    for (const w of writes) {
      const changed = await changeRow(w);
      if (typeof changed === 'object') {
        rows.push(changed);
        continue;
      }
      if (changed === 'no-route') current ??= await readInboundRows();
      const base = (changed === 'no-route' ? current?.get(w.id) : undefined) ?? w.fallback;
      if (!base) {
        missing.push(w.id);
        continue;
      }
      const row = applyInboundChange(base, w.change);
      await b2bBackendFetch('/rows', { method: 'POST', body: row });
      rows.push(row);
    }
    return { rows, missing };
  });
}

export const ownerChange = (name: string, kylasUserId: number): InboundRowChange => ({
  owner: name,
  meta: { owner_kylas_id: kylasUserId },
  append: {},
});

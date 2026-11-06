import { b2bBackendFetch } from '@/lib/server/b2b-backend';
import { allOrders } from '@/lib/server/b2b-revenue';
import { getCached, setCache } from '@/lib/server/cache';
import { RECENT_DAYS, RECENT_EVERY_MS, YEAR_MONTHS } from '@/lib/b2b/client-import/constants';
import type { ClientImportOutcome, ClientImportPlan, ClientImportScope } from '@/lib/b2b/client-import/types';
import { planOrderFirms } from '@/lib/b2b/client-import/utils';
import type { B2BLeadRow } from '@/lib/b2b/data/rows';
import { monthWindows } from '@/lib/b2b/revenue/utils/months';
import { istToday } from '@/lib/b2b/stats/pipeline';

const WRITE_CHUNK = 500;
const PARALLEL_WINDOWS = 3;
const RECENT_KEY = 'b2b-client-import:recent';

const daysBefore = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

function windowsFor(scope: ClientImportScope): { from: string; to: string }[] {
  const today = istToday();
  if (scope === 'recent') return [{ from: daysBefore(today, RECENT_DAYS), to: today }];
  return monthWindows(new Date(), YEAR_MONTHS).map(({ from, to }) => ({ from, to }));
}

async function readOrders(scope: ClientImportScope, auth: string) {
  const windows = windowsFor(scope);
  const query = (w: { from: string; to: string }) => `order_from=${w.from}&order_to=${w.to}&branch_basis=estimate`;
  const reads: Awaited<ReturnType<typeof allOrders>>[] = [];
  for (let i = 0; i < windows.length; i += PARALLEL_WINDOWS) {
    reads.push(...await Promise.all(windows.slice(i, i + PARALLEL_WINDOWS).map((w) => allOrders(query(w), auth))));
  }
  const unique = new Map(reads.flatMap((r) => r.orders).map((o) => [o.id, o]));
  return {
    orders: [...unique.values()],
    from: windows[windows.length - 1].from,
    to: windows[0].to,
    truncated: reads.some((r) => r.truncated),
  };
}

async function plan(scope: ClientImportScope, auth: string): Promise<{ summary: ClientImportPlan; rows: B2BLeadRow[] }> {
  const at = new Date().toISOString();
  const [read, rows] = await Promise.all([readOrders(scope, auth), b2bBackendFetch<B2BLeadRow[]>('/rows')]);
  const planned = planOrderFirms(read.orders, rows, at);
  const summary: ClientImportPlan = {
    scope,
    from: read.from,
    to: read.to,
    ordersRead: read.orders.length,
    firmsFound: planned.firmsFound,
    alreadyHere: planned.alreadyHere,
    noPhone: planned.noPhone,
    newFirms: planned.rows.length,
    truncated: read.truncated,
    checkedAt: at,
  };
  return { summary, rows: planned.rows };
}

export async function previewClientImport(scope: ClientImportScope, auth: string): Promise<ClientImportPlan> {
  return (await plan(scope, auth)).summary;
}

const inflight = new Map<ClientImportScope, Promise<ClientImportOutcome>>();

async function write(scope: ClientImportScope, auth: string): Promise<ClientImportOutcome> {
  const { summary, rows } = await plan(scope, auth);
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await b2bBackendFetch('/rows/bulk', { method: 'POST', body: { rows: rows.slice(i, i + WRITE_CHUNK), only_new: true } });
  }
  return { ...summary, imported: rows.length, rows, throttled: false };
}

export function runClientImport(scope: ClientImportScope, auth: string): Promise<ClientImportOutcome> {
  if (scope === 'recent') {
    const last = getCached(RECENT_KEY) as ClientImportOutcome | null;
    if (last) return Promise.resolve({ ...last, imported: 0, rows: [], throttled: true });
  }
  const running = inflight.get(scope);
  if (running) return running;
  const next = write(scope, auth)
    .then((outcome) => {
      setCache(RECENT_KEY, { ...outcome, rows: [] }, RECENT_EVERY_MS);
      return outcome;
    })
    .finally(() => inflight.delete(scope));
  inflight.set(scope, next);
  return next;
}

import type { ChecklistDay, ChecklistMarks } from './types';

const ROUTE = '/api/store-checklist';

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown>; }
  catch { return {}; }
}

function failure(body: Record<string, unknown>, res: Response): Error {
  const msg = typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`;
  return new Error(msg);
}

export async function fetchChecklistDays(
  storeCodes: readonly string[],
  from: string,
  to: string,
): Promise<ChecklistDay[]> {
  const params = new URLSearchParams({ stores: storeCodes.join(','), from, to });
  const res = await fetch(`${ROUTE}?${params}`, { cache: 'no-store' });
  const body = await readJson(res);
  if (!res.ok) throw failure(body, res);
  return (body.days as ChecklistDay[]) ?? [];
}

export async function saveChecklistMarks(
  storeCode: string,
  date: string,
  marks: ChecklistMarks,
  by: string,
): Promise<ChecklistDay> {
  const res = await fetch(ROUTE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: storeCode, date, marks, by }),
  });
  const body = await readJson(res);
  if (!res.ok) throw failure(body, res);
  return body.day as ChecklistDay;
}

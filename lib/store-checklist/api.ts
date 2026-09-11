import { getToken, refreshSession } from '../api/core/client';
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

async function send(path: string, init: RequestInit = {}, retried = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${getToken()}`,
  };
  const res = await fetch(path, { ...init, cache: 'no-store', headers });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return send(path, init, true);
  }
  const body = await readJson(res);
  if (!res.ok) throw failure(body, res);
  return body;
}

export async function fetchChecklistDays(
  storeCodes: readonly string[],
  from: string,
  to: string,
): Promise<ChecklistDay[]> {
  const params = new URLSearchParams({ stores: storeCodes.join(','), from, to });
  const body = await send(`${ROUTE}?${params}`);
  return (body.days as ChecklistDay[]) ?? [];
}

export async function saveChecklistMarks(
  storeCode: string,
  date: string,
  marks: ChecklistMarks,
): Promise<ChecklistDay> {
  const body = await send(ROUTE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: storeCode, date, marks }),
  });
  return body.day as ChecklistDay;
}

import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { markItems, readDays } from '@/lib/store-checklist/checklist-store';
import type { ChecklistMarks, ChecklistValue } from '@/lib/store-checklist/types';
import {
  backdateDaysFor,
  canMarkDate,
  canUseChecklist,
  CHECKLIST_ITEM_INDEX,
  isValidDate,
  istToday,
  shiftDate,
  storeLabel,
  storesForActor,
} from '@/lib/store-checklist/utils';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 62;
const MAX_MARKS = 60;
const MAX_COMMENT = 500;
const VALUES = new Set<ChecklistValue>(['yes', 'no', 'na']);

const bad = (error: string, status = 400) => Response.json({ error }, { status });

class AccessError extends Error {}

const accessErrorResponse = (err: unknown) =>
  err instanceof AccessError ? Response.json({ error: err.message }, { status: 403 }) : null;

function authorise(caller: Caller): string[] {
  if (!canUseChecklist(caller)) {
    throw new AccessError('Your account does not have access to the store checklist');
  }
  const stores = storesForActor(caller);
  if (stores.length === 0) {
    throw new AccessError('No Experience Centre is mapped to your account — ask an admin to set your branch');
  }
  return stores;
}

export async function GET(request: NextRequest) {
  let caller: Caller;
  let permitted: string[];
  try {
    caller = await requireCaller(request);
    permitted = authorise(caller);
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  const params = request.nextUrl.searchParams;
  const asked = (params.get('stores') ?? params.get('store') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const stores = asked.length ? asked : permitted;

  const forbidden = stores.filter((s) => !permitted.includes(s));
  if (forbidden.length) {
    return Response.json(
      { error: `Your account cannot read ${forbidden.map(storeLabel).join(', ')}` },
      { status: 403 },
    );
  }

  const to = params.get('to') ?? params.get('date') ?? istToday();
  const from = params.get('from') ?? to;
  if (!isValidDate(from) || !isValidDate(to)) return bad("'from' and 'to' must be YYYY-MM-DD");
  if (from > to) return bad("'from' must not be after 'to'");
  if (from < shiftDate(to, -(MAX_RANGE_DAYS - 1))) return bad(`Range is capped at ${MAX_RANGE_DAYS} days`);

  try {
    const days = await readDays(stores, from, to);
    return Response.json({ days, from, to });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Read failed' }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  let caller: Caller;
  let permitted: string[];
  try {
    caller = await requireCaller(request);
    permitted = authorise(caller);
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  let body: { store?: unknown; date?: unknown; marks?: unknown };
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }

  const store = body.store;
  if (typeof store !== 'string' || !permitted.includes(store)) {
    return Response.json({ error: 'Your account cannot mark this store' }, { status: 403 });
  }

  const date = body.date;
  const today = istToday();
  if (!isValidDate(date)) return bad("'date' must be YYYY-MM-DD");
  if (!canMarkDate(caller.role, date, today)) {
    const days = backdateDaysFor(caller.role);
    return Response.json(
      {
        error: date > today
          ? 'Cannot mark a future date'
          : `Your account can mark ${days === 0 ? `today (${today}) only` : `the last ${days + 1} days only`}`,
      },
      { status: 403 },
    );
  }

  const raw = body.marks;
  if (!raw || typeof raw !== 'object') return bad("'marks' must be an object keyed by item id");
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return bad("'marks' is empty");
  if (entries.length > MAX_MARKS) return bad(`At most ${MAX_MARKS} marks per request`);

  const by = caller.name || caller.phone || 'unknown';
  const at = new Date().toISOString();
  const marks: ChecklistMarks = {};
  const unknownItems: string[] = [];
  for (const [id, value] of entries) {
    if (!CHECKLIST_ITEM_INDEX[id]) { unknownItems.push(id); continue; }
    const mark = (value ?? {}) as { v?: unknown; c?: unknown };
    if (!VALUES.has(mark.v as ChecklistValue)) return bad(`Item '${id}' needs v of yes, no or na`);
    marks[id] = {
      v: mark.v as ChecklistValue,
      c: typeof mark.c === 'string' ? mark.c.trim().slice(0, MAX_COMMENT) : '',
      at,
      by,
    };
  }
  if (Object.keys(marks).length === 0) {
    return bad(`No known checklist items in payload (saw: ${unknownItems.join(', ')})`);
  }

  try {
    const day = await markItems(store, date, marks, by);
    return Response.json({
      ok: true,
      day,
      savedAt: at,
      ...(unknownItems.length ? { ignored: unknownItems } : {}),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 502 });
  }
}

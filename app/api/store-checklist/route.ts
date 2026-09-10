import type { NextRequest } from 'next/server';
import { markItems, readDays } from '@/lib/store-checklist/checklist-store';
import type { ChecklistMarks, ChecklistValue } from '@/lib/store-checklist/types';
import { CHECKLIST_ITEM_INDEX, isKnownStoreCode, isValidDate, istToday, shiftDate } from '@/lib/store-checklist/utils';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 62;
const MAX_MARKS = 60;
const MAX_COMMENT = 500;
const MAX_BACKDATE_DAYS = 30;
const VALUES = new Set<ChecklistValue>(['yes', 'no', 'na']);

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stores = (params.get('stores') ?? params.get('store') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (stores.length === 0) return bad("Pass 'stores' as a comma-separated list of store codes");
  const unknown = stores.filter((s) => !isKnownStoreCode(s));
  if (unknown.length) return bad(`Unknown store code${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);

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
  let body: { store?: unknown; date?: unknown; marks?: unknown; by?: unknown };
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }

  const store = body.store;
  if (!isKnownStoreCode(store)) return bad('Unknown store code');

  const date = body.date;
  const today = istToday();
  if (!isValidDate(date)) return bad("'date' must be YYYY-MM-DD");
  if (date > today) return bad('Cannot mark a future date');
  if (date < shiftDate(today, -MAX_BACKDATE_DAYS)) return bad(`Cannot mark more than ${MAX_BACKDATE_DAYS} days back`);

  const raw = body.marks;
  if (!raw || typeof raw !== 'object') return bad("'marks' must be an object keyed by item id");
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return bad("'marks' is empty");
  if (entries.length > MAX_MARKS) return bad(`At most ${MAX_MARKS} marks per request`);

  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 120) : 'unknown';
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

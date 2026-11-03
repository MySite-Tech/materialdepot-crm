import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { writeInbound } from '@/lib/server/b2b-inbound';
import { canUseB2B } from '@/lib/b2b/team/utils';
import type { B2BLeadRow, InboundRowChange } from '@/lib/b2b/data/rows';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function POST(request: NextRequest) {
  let c: Caller;
  try {
    c = await requireCaller(request);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
  if (!canUseB2B(c)) return bad('Your account does not have B2B Sales access', 403);

  let body: { id?: unknown; change?: unknown; row?: unknown };
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }

  const id = String(body.id ?? '').trim();
  const change = body.change as InboundRowChange;
  if (!id) return bad("'id' is required");
  if (!isRecord(change) || !isRecord(change.meta) || !isRecord(change.append)) return bad("'change' needs meta and append");
  if (Object.values(change.append).some((v) => !Array.isArray(v))) return bad('Every append must be a list');
  const fallback = isRecord(body.row) && body.row.pipeline === 'inbound' && String(body.row.id) === id
    ? (body.row as unknown as B2BLeadRow)
    : undefined;

  try {
    const { rows } = await writeInbound([{ id, change, fallback }]);
    if (!rows.length) return bad('That lead is not in the CRM', 404);
    return Response.json({ row: rows[0] });
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Save failed', 502);
  }
}

import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { readSnapshot, skusFor } from '@/lib/server/md-snapshot';
import { canUseB2B } from '@/lib/b2b/team/utils';
import { dealPhone } from '@/lib/b2b/inbound-deals/utils';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: NextRequest) {
  let c: Caller;
  try {
    c = await requireCaller(request);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
  if (!canUseB2B(c)) return bad('Your account does not have B2B Sales access', 403);

  let body: { enqId?: unknown; phone?: unknown };
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }
  const enqId = String(body.enqId ?? '').trim();
  const phone = dealPhone(String(body.phone ?? ''));
  if (!/^[A-Za-z0-9]{6,40}$/.test(enqId)) return bad("'enqId' is not a ticket id");
  if (phone.length !== 10) return bad("'phone' must be a 10-digit number");

  try {
    return Response.json(skusFor(await readSnapshot(Number(phone)), enqId));
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'The product lookup failed', 502);
  }
}

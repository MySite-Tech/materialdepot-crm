import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { readOpenDeals } from '@/lib/server/b2b-inbound';
import { canUseB2B } from '@/lib/b2b/team/utils';
import { DEALS_MAX_PHONES } from '@/lib/b2b/inbound-deals/constants';
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

  let body: { phones?: unknown; fresh?: unknown };
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }
  if (!Array.isArray(body.phones)) return bad("'phones' must be a list");
  if (body.phones.length > DEALS_MAX_PHONES) return bad(`At most ${DEALS_MAX_PHONES} numbers`);
  const wanted = new Set(body.phones.map((p) => dealPhone(String(p))).filter((p) => p.length === 10));

  try {
    const report = await readOpenDeals(c.userId, request.headers.get('authorization') ?? '', body.fresh === true);
    return Response.json({ ...report, deals: report.deals.filter((d) => wanted.has(d.phone)) });
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Open carts could not be read', 502);
  }
}

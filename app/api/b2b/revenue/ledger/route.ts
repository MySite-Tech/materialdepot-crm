import type { NextRequest } from 'next/server';
import { getCached, setCache } from '@/lib/server/cache';
import { buildBranchLedger } from '@/lib/server/b2b-revenue';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { canUseB2B } from '@/lib/b2b/team/utils';
import type { BranchLedger } from '@/lib/b2b/revenue/types';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    const caller = await requireCaller(request);
    if (!canUseB2B(caller)) return bad('Your account does not have B2B Sales access', 403);
    userId = caller.userId;
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  const q = request.nextUrl.searchParams;
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  const basis = q.get('basis') === 'created' ? 'created' : 'order';
  if ((from || to) && (!DAY.test(from) || !DAY.test(to) || from > to)) return bad('from and to must be dates');

  const key = `b2b-ledger:${userId}:${basis}:${from}:${to}`;
  const cached = getCached(key) as BranchLedger | null;
  if (cached) return Response.json(cached);

  try {
    const ledger = await buildBranchLedger(from, to, basis, request.headers.get('authorization') ?? '');
    setCache(key, ledger);
    return Response.json(ledger);
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Orders could not be read', 502);
  }
}

import type { NextRequest } from 'next/server';
import { getCached, setCache } from '@/lib/server/cache';
import { buildRevenueReport } from '@/lib/server/b2b-revenue';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { canUseB2B } from '@/lib/b2b/team/utils';
import type { RevenueReport } from '@/lib/b2b/revenue/types';

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
  if (!DAY.test(from) || !DAY.test(to) || from > to) return bad('from and to must be dates');

  const key = `b2b-revenue:${userId}:${from}:${to}`;
  const cached = getCached(key) as RevenueReport | null;
  if (cached && q.get('fresh') !== '1') return Response.json(cached);

  try {
    const report = await buildRevenueReport(from, to, request.headers.get('authorization') ?? '');
    setCache(key, report);
    return Response.json(report);
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Revenue could not be read', 502);
  }
}

import type { NextRequest } from 'next/server';
import { revenueReport } from '@/lib/server/b2b-revenue';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { canUseB2B } from '@/lib/b2b/team/utils';

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

  try {
    return Response.json(await revenueReport(userId, from, to, request.headers.get('authorization') ?? '', q.get('fresh') === '1'));
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Revenue could not be read', 502);
  }
}

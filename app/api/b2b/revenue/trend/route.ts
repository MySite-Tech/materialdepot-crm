import type { NextRequest } from 'next/server';
import { buildRevenueTrend } from '@/lib/server/b2b-revenue';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { canUseB2B } from '@/lib/b2b/team/utils';

export const dynamic = 'force-dynamic';

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

  try {
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    return Response.json(await buildRevenueTrend(userId, request.headers.get('authorization') ?? '', fresh));
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Revenue could not be read', 502);
  }
}

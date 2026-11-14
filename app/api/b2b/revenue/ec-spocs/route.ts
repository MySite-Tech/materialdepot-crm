import type { NextRequest } from 'next/server';
import { buildEcSpocs } from '@/lib/server/b2b-revenue';
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
    return Response.json(await buildEcSpocs(userId, request.headers.get('authorization') ?? ''));
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'EC SPoCs could not be read', 502);
  }
}

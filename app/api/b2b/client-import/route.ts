import type { NextRequest } from 'next/server';
import { reviewQueue } from '@/lib/server/b2b-client-import';
import { B2BBackendError } from '@/lib/server/b2b-backend';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { isB2BManager } from '@/lib/b2b/team/utils';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCaller(request);
    if (!isB2BManager(caller)) return bad('Only a B2B manager can review firms found on orders', 403);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === '1';
    return Response.json(await reviewQueue(request.headers.get('authorization') ?? '', refresh));
  } catch (err) {
    return bad(err instanceof B2BBackendError || err instanceof Error ? err.message : 'Orders could not be read', 502);
  }
}

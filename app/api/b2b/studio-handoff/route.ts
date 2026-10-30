import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { B2BBackendError, b2bBackendFetch, studioHandoffUrl } from '@/lib/server/b2b-backend';
import { canUseB2B } from '@/lib/b2b/team/utils';

export const dynamic = 'force-dynamic';

const bad = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: NextRequest) {
  let caller: Caller;
  try {
    caller = await requireCaller(request);
    if (!canUseB2B(caller)) return bad('Only the B2B team can sign in to Studio Space from the CRM', 403);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  try {
    const { code } = await b2bBackendFetch<{ code: string }>('/staff-handoff', { method: 'POST', body: { phone: caller.phone } });
    return Response.json({ url: studioHandoffUrl(code) });
  } catch (err) {
    if (err instanceof B2BBackendError && err.status === 404 && err.message === 'Not Found') {
      return bad('Automatic sign-in is not deployed on Studio Space yet', 502);
    }
    if (err instanceof B2BBackendError && (err.status === 404 || err.status === 409)) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : 'Could not reach Studio Space', 502);
  }
}

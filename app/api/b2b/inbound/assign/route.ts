import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { InputError, readMembers, reassignInboundLead, rotateInbound, TeamTableMissing } from '@/lib/server/b2b-team';
import { canUseB2B, isB2BManager, membershipsForPhone } from '@/lib/b2b/team/utils';

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

  let body: { mode?: unknown; dryRun?: unknown; leadId?: unknown; toPhone?: unknown; reason?: unknown };
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }

  try {
    if (body.mode === 'rotate') {
      return Response.json(await rotateInbound(c.name, body.dryRun === true));
    }
    if (body.mode === 'reassign') {
      if (!isB2BManager(c)) {
        const mine = membershipsForPhone((await readMembers()).members, c.phone);
        if (!mine.some((m) => m.team === 'inbound')) {
          return bad('Only the inbound team or a B2B manager can reassign inbound leads', 403);
        }
      }
      const to = await reassignInboundLead(
        String(body.leadId ?? ''), String(body.toPhone ?? ''), String(body.reason ?? ''), c.name,
      );
      return Response.json({ to: to.name });
    }
    return bad("'mode' must be rotate or reassign");
  } catch (err) {
    if (err instanceof InputError) return bad(err.message);
    if (err instanceof TeamTableMissing) return bad(err.message, 503);
    return bad(err instanceof Error ? err.message : 'Assignment failed', 502);
  }
}

import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { InputError, listKylasUsers, readMembers, saveMember, TeamTableMissing } from '@/lib/server/b2b-team';
import { B2B_TEAMS } from '@/lib/b2b/team/constants';
import type { MemberInput } from '@/lib/b2b/team/types';
import { canUseB2B, isB2BManager } from '@/lib/b2b/team/utils';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

const TEAM_KEYS = new Set(B2B_TEAMS.map((t) => t.key));

async function caller(request: NextRequest): Promise<Caller | Response> {
  try {
    const c = await requireCaller(request);
    if (!canUseB2B(c)) return bad('Your account does not have B2B Sales access', 403);
    return c;
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
}

function failure(err: unknown): Response {
  if (err instanceof InputError) return bad(err.message);
  if (err instanceof TeamTableMissing) return bad(err.message, 503);
  return bad(err instanceof Error ? err.message : 'Request failed', 502);
}

export async function GET(request: NextRequest) {
  const c = await caller(request);
  if (c instanceof Response) return c;

  try {
    if (request.nextUrl.searchParams.get('kylasUsers')) {
      if (!isB2BManager(c)) return bad('Only a B2B manager can list Kylas users', 403);
      return Response.json({ kylasUsers: await listKylasUsers() });
    }
    return Response.json(await readMembers());
  } catch (err) {
    return failure(err);
  }
}

export async function PUT(request: NextRequest) {
  const c = await caller(request);
  if (c instanceof Response) return c;
  if (!isB2BManager(c)) return bad('Only a B2B manager can change the team', 403);

  let body: Partial<MemberInput>;
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }

  if (!body.team || !TEAM_KEYS.has(body.team)) return bad("'team' must be inbound, outreach or kam");
  if (body.kylasUserId !== undefined && body.kylasUserId !== null && !Number.isInteger(body.kylasUserId)) {
    return bad("'kylasUserId' must be an integer, null, or absent");
  }

  try {
    return Response.json(await saveMember({
      phone: String(body.phone ?? ''),
      name: String(body.name ?? ''),
      team: body.team,
      inRotation: body.inRotation !== false,
      active: body.active !== false,
      kylasUserId: body.kylasUserId,
    }, c.name));
  } catch (err) {
    return failure(err);
  }
}

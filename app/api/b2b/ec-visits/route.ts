import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { B2BBackendError, b2bBackendFetch } from '@/lib/server/b2b-backend';
import { EC_VISIT_STATUSES } from '@/lib/b2b/ec-visits/constants';
import { ecVisitQueryString } from '@/lib/b2b/ec-visits/utils';
import type { EcVisitKind, EcVisitRow } from '@/lib/b2b/ec-visits/types';
import { canUseB2B } from '@/lib/b2b/team/utils';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function caller(request: NextRequest): Promise<Caller | Response> {
  try {
    return await requireCaller(request);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
}

function failure(err: unknown): Response {
  if (err instanceof B2BBackendError && err.status === 404) {
    return bad('EC visits are not set up on the B2B backend yet — deploy b2b-backend migration 0021', 503);
  }
  return bad(err instanceof Error ? err.message : 'Request failed', 502);
}

export async function GET(request: NextRequest) {
  const c = await caller(request);
  if (c instanceof Response) return c;

  const q = request.nextUrl.searchParams;
  const from = q.get('from') ?? undefined;
  const to = q.get('to') ?? undefined;
  const clientId = q.get('client_id') ?? undefined;
  const kind = q.get('kind') ?? undefined;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return bad("'from' and 'to' must be YYYY-MM-DD");
  if (kind && kind !== 'redirect' && kind !== 'visit') return bad("'kind' must be visit or redirect");
  if (!clientId && !(from && to) && kind !== 'redirect') return bad("Ask for one firm ('client_id'), a date range ('from' and 'to') or kind=redirect");
  if (kind === 'redirect' && !canUseB2B(c)) return bad('Only the B2B team can list EC redirects', 403);

  try {
    return Response.json(await b2bBackendFetch(`/ec-visits${ecVisitQueryString({ clientId, from, to, kind: kind as EcVisitKind | undefined })}`));
  } catch (err) {
    return failure(err);
  }
}

export async function PUT(request: NextRequest) {
  const c = await caller(request);
  if (c instanceof Response) return c;
  if (!canUseB2B(c)) return bad('Only the B2B team can schedule EC visits', 403);

  let body: Partial<EcVisitRow>;
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }

  if (!String(body.id ?? '').trim() || !String(body.firm ?? '').trim() || !String(body.branch ?? '').trim()) {
    return bad("'id', 'firm' and 'branch' are required");
  }
  const redirect = body.kind === 'redirect';
  if (body.kind && body.kind !== 'visit' && !redirect) return bad("'kind' must be visit or redirect");
  if ((!redirect || body.visit_date) && !DAY.test(String(body.visit_date ?? ''))) return bad("'visit_date' must be YYYY-MM-DD");
  if (body.status && !EC_VISIT_STATUSES.includes(body.status)) return bad(`Unknown status '${body.status}'`);

  try {
    return Response.json(await b2bBackendFetch('/ec-visits', {
      method: 'PUT',
      body: { ...body, status: body.status ?? (redirect ? 'Directed' : 'Scheduled'), scheduled_by: c.name, updated_by: c.name },
    }));
  } catch (err) {
    return failure(err);
  }
}

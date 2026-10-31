import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { B2BBackendError, b2bBackendFetch } from '@/lib/server/b2b-backend';
import { canUseB2B } from '@/lib/b2b/team/utils';
import { normalisePhone } from '@/lib/org/utils';

export const dynamic = 'force-dynamic';

const bad = (error: string, status: number) => Response.json({ error }, { status });

const text = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return s || undefined;
};

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCaller(request);
    if (!canUseB2B(caller)) return bad('Only the B2B team can read the Studio Space waitlist', 403);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  let body: { signups?: unknown };
  try {
    body = await b2bBackendFetch<{ signups?: unknown }>('/waitlist');
  } catch (err) {
    if (err instanceof B2BBackendError && err.status === 404) {
      return bad('The B2B backend has no waitlist route yet (GET /b2b/waitlist)', 502);
    }
    return bad(err instanceof Error ? err.message : 'Could not reach the B2B backend', 502);
  }
  if (!Array.isArray(body?.signups)) return bad('The B2B backend answered without a signups list', 502);

  const signups = (body.signups as Record<string, unknown>[])
    .map((r) => ({
      phone: normalisePhone(String(r.phone ?? '')),
      firmName: text(r.firm_name) ?? '',
      contactName: text(r.contact_name) ?? '',
      city: text(r.city),
      firmType: text(r.firm_type),
      teamSize: text(r.team_size),
      status: text(r.status) ?? 'new',
      createdAt: text(r.created_at) ?? '',
    }))
    .filter((s) => s.phone.length === 10);

  return Response.json({ signups });
}

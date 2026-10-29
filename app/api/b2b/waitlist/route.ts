import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
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

  const base = (process.env.PARTNER_APP_BASE_URL ?? '').replace(/\/+$/, '');
  const secret = process.env.PARTNER_SYNC_SECRET ?? '';
  if (!base) return bad('PARTNER_APP_BASE_URL is not set on this deployment', 503);
  if (!secret) return bad('PARTNER_SYNC_SECRET is not set on this deployment', 503);

  let res: Response;
  try {
    res = await fetch(`${base}/api/sync/waitlist`, { headers: { 'x-sync-key': secret }, cache: 'no-store' });
  } catch {
    return bad('Could not reach Studio Space', 502);
  }
  const body = (await res.json().catch(() => null)) as { signups?: unknown; error?: unknown } | null;
  if (res.status === 404) return bad('Studio Space has no waitlist sync route yet (GET /api/sync/waitlist)', 502);
  if (!res.ok || !Array.isArray(body?.signups)) {
    return bad(typeof body?.error === 'string' ? body.error : `Studio Space answered ${res.status}`, 502);
  }

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

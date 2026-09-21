import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const B2B_ROLES = new Set(['admin', 'b2b_sales']);

const FIRM_TYPES = new Set([
  'architect', 'interior_designer', 'design_build', 'turnkey',
  'modulars', 'builders', 'marquee_client', 'contractor', 'other',
]);

const ONBOARDING_SOURCES = new Set(['self_signup', 'outreach', 'inbound', 'existing_client']);

const MAX_ROWS = 500;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

class AccessError extends Error {}

const accessErrorResponse = (err: unknown) =>
  err instanceof AccessError ? Response.json({ error: err.message }, { status: 403 }) : null;

function authorise(caller: Caller): void {
  if (!B2B_ROLES.has(caller.role)) {
    throw new AccessError('Only the B2B team can reach the partner dashboards');
  }
}

function endpoint(): { base: string; secret: string } | Response {
  const base = (process.env.PARTNER_APP_BASE_URL ?? '').replace(/\/+$/, '');
  const secret = process.env.PARTNER_SYNC_SECRET ?? '';
  if (!base) return bad('PARTNER_APP_BASE_URL is not set on this deployment', 503);
  if (!secret) return bad('PARTNER_SYNC_SECRET is not set on this deployment', 503);
  return { base, secret };
}

async function relay(url: string, secret: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), 'x-sync-key': secret },
      cache: 'no-store',
    });
  } catch {
    return bad('Could not reach the partner dashboards', 502);
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = (body as { error?: unknown })?.error;
    return bad(typeof detail === 'string' ? detail : `Partner dashboards answered ${res.status}`, 502);
  }
  return Response.json(body);
}

export async function GET(request: NextRequest) {
  try {
    authorise(await requireCaller(request));
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  const target = endpoint();
  if (target instanceof Response) return target;

  const ids = (request.nextUrl.searchParams.get('ids') ?? '').trim();
  const query = ids ? `?ids=${encodeURIComponent(ids)}` : '';
  return relay(`${target.base}/api/sync/partners${query}`, target.secret);
}

export async function POST(request: NextRequest) {
  try {
    authorise(await requireCaller(request));
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  const target = endpoint();
  if (target instanceof Response) return target;

  let body: { clients?: unknown };
  try {
    body = (await request.json()) as { clients?: unknown };
  } catch {
    return bad('Bad request body');
  }

  const clients = Array.isArray(body.clients) ? body.clients : null;
  if (!clients || !clients.length) return bad('Send at least one client');
  if (clients.length > MAX_ROWS) return bad(`Send at most ${MAX_ROWS} clients in one push`);

  for (const row of clients as Array<Record<string, unknown>>) {
    const id = String(row.md_client_id ?? '').trim();
    if (!id) return bad('Every client needs an md_client_id');
    if (!String(row.firm_name ?? '').trim()) return bad(`${id}: firm_name is required`);
    if (!String(row.contact_name ?? '').trim()) return bad(`${id}: contact_name is required`);
    if (!/^[6-9]\d{9}$/.test(String(row.phone ?? ''))) return bad(`${id}: phone must be ten digits`);
    if (!FIRM_TYPES.has(String(row.firm_type ?? ''))) return bad(`${id}: firm_type ${String(row.firm_type)} is not a partner firm type`);
    if (row.onboarding_source !== undefined && !ONBOARDING_SOURCES.has(String(row.onboarding_source))) {
      return bad(`${id}: onboarding_source ${String(row.onboarding_source)} is not recognised`);
    }
  }

  return relay(`${target.base}/api/sync/partners`, target.secret, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clients }),
  });
}

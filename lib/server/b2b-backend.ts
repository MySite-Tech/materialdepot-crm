import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from './session';

const B2B_ROLES = new Set(['admin', 'b2b_sales']);
const ALLOW = new Set(['rows', 'kam-load', 'target']);

class AccessError extends Error {}

function authorise(caller: Caller): void {
  if (!B2B_ROLES.has(caller.role)) {
    throw new AccessError('Only the B2B team can use this data');
  }
}

const accessErrorResponse = (err: unknown) =>
  err instanceof AccessError ? Response.json({ error: err.message }, { status: 403 }) : null;

function endpoint(): { base: string; secret: string } | Response {
  const base = (process.env.B2B_BACKEND_URL ?? '').replace(/\/+$/, '');
  const secret = process.env.B2B_BACKEND_SECRET ?? '';
  if (!base) return Response.json({ error: 'B2B_BACKEND_URL is not set on this deployment' }, { status: 503 });
  if (!secret) return Response.json({ error: 'B2B_BACKEND_SECRET is not set on this deployment' }, { status: 503 });
  return { base, secret };
}

export async function relayB2B(
  request: NextRequest,
  path: string[],
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  try {
    authorise(await requireCaller(request));
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!path.length || !ALLOW.has(path[0])) {
    return Response.json({ error: 'Unknown B2B resource' }, { status: 404 });
  }

  const target = endpoint();
  if (target instanceof Response) return target;

  const search = new URL(request.url).search;
  const hasBody = init?.body !== undefined;
  let res: Response;
  try {
    res = await fetch(`${target.base}/b2b/${path.join('/')}${search}`, {
      method: init?.method ?? 'GET',
      headers: { 'x-sync-key': target.secret, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
      body: hasBody ? JSON.stringify(init?.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'Could not reach the B2B backend' }, { status: 502 });
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = (body as { error?: unknown })?.error;
    return Response.json({ error: typeof detail === 'string' ? detail : `B2B backend answered ${res.status}` }, { status: 502 });
  }
  return Response.json(body);
}

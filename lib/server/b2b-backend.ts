import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from './session';
import { canUseB2B, isB2BManager } from '@/lib/b2b/team/utils';

const ALLOW = new Set(['rows', 'kam-load', 'target', 'studio-access', 'studio-number']);

class AccessError extends Error {}

function authorise(caller: Caller): void {
  if (!canUseB2B(caller)) {
    throw new AccessError('Only the B2B team can use this data');
  }
}

function managersOnly(path: string[], method: string, search: URLSearchParams): boolean {
  if (path[0] === 'studio-number') return true;
  return path[0] === 'rows' && method === 'DELETE' && (search.get('pipeline') ?? 'client') === 'client';
}

const accessErrorResponse = (err: unknown) =>
  err instanceof AccessError ? Response.json({ error: err.message }, { status: 403 }) : null;

export class B2BBackendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function b2bBackendFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const target = endpoint();
  if (target instanceof Response) throw new B2BBackendError(503, 'B2B_BACKEND_URL or B2B_BACKEND_SECRET is not set on this deployment');
  const hasBody = init?.body !== undefined;
  const res = await fetch(`${target.base}/b2b${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'x-sync-key': target.secret, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
    body: hasBody ? JSON.stringify(init?.body) : undefined,
    cache: 'no-store',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new B2BBackendError(res.status, errorDetail(body) ?? `B2B backend answered ${res.status}`);
  return body as T;
}

export function studioHandoffUrl(code: string): string {
  const target = endpoint();
  if (target instanceof Response) throw new B2BBackendError(503, 'B2B_BACKEND_URL or B2B_BACKEND_SECRET is not set on this deployment');
  return `${target.base}/auth/handoff?code=${encodeURIComponent(code)}`;
}

function errorDetail(body: unknown): string | undefined {
  const b = body as { error?: unknown; detail?: unknown } | null;
  const d = b?.error ?? b?.detail;
  return typeof d === 'string' ? d : undefined;
}

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
    const caller = await requireCaller(request);
    authorise(caller);
    if (managersOnly(path, init?.method ?? 'GET', new URL(request.url).searchParams) && !isB2BManager(caller)) {
      throw new AccessError('Only a B2B manager or an admin can do this');
    }
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
    return Response.json({ error: errorDetail(body) ?? `B2B backend answered ${res.status}` }, { status: 502 });
  }
  return Response.json(body);
}

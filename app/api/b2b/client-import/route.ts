import type { NextRequest } from 'next/server';
import { previewClientImport, runClientImport } from '@/lib/server/b2b-client-import';
import { B2BBackendError } from '@/lib/server/b2b-backend';
import { requireCaller, sessionErrorResponse } from '@/lib/server/session';
import { isB2BManager } from '@/lib/b2b/team/utils';
import type { ClientImportScope } from '@/lib/b2b/client-import/types';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

async function guard(request: NextRequest): Promise<Response | null> {
  try {
    const caller = await requireCaller(request);
    return isB2BManager(caller) ? null : bad('Only a B2B manager can import firms from orders', 403);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
}

const scopeOf = (request: NextRequest): ClientImportScope =>
  request.nextUrl.searchParams.get('scope') === 'year' ? 'year' : 'recent';

const failure = (err: unknown): Response =>
  bad(err instanceof B2BBackendError || err instanceof Error ? err.message : 'Orders could not be read', 502);

export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return Response.json(await previewClientImport(scopeOf(request), request.headers.get('authorization') ?? ''));
  } catch (err) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return Response.json(await runClientImport(scopeOf(request), request.headers.get('authorization') ?? ''));
  } catch (err) {
    return failure(err);
  }
}

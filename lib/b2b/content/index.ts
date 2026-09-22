import { getToken, refreshSession } from '@/lib/api/core/client';
import type { ContentSet, PartnerBanner, PartnerLaunch, PushOutcome } from './types';

const ROUTE = '/api/b2b/partner-content';

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown>; }
  catch { return {}; }
}

async function send(init: RequestInit = {}, retried = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${getToken()}`,
  };
  const res = await fetch(ROUTE, { ...init, cache: 'no-store', headers });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return send(init, true);
  }
  const body = await readJson(res);
  if (!res.ok) {
    const msg = typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body;
}

export async function fetchPartnerContent(): Promise<ContentSet> {
  const body = await send();
  return {
    banners: (body.banners as PartnerBanner[]) ?? [],
    launches: (body.launches as PartnerLaunch[]) ?? [],
  };
}

export async function pushPartnerContent(payload: {
  banners?: (PartnerBanner & { image_data?: string })[];
  launches?: (PartnerLaunch & { image_data?: string })[];
  remove?: { banners?: string[]; launches?: string[] };
}): Promise<PushOutcome> {
  const body = await send({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return {
    banners: body.banners as PushOutcome['banners'],
    launches: body.launches as PushOutcome['launches'],
    skipped: (body.skipped as PushOutcome['skipped']) ?? [],
  };
}

export * from './types';
export * from './utils';

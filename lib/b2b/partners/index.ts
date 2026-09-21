import { getToken, refreshSession } from '../../api/core/client';
import type { PartnerFirm, PartnerPushRow } from '@/components/b2b/models/client/partner';

const ROUTE = '/api/b2b/partner-push';

export interface PartnerPushResult {
  received: number;
  created: number;
  linked: number;
  updated: number;
  skipped: Array<{ key: string; reason: string; detail?: string }>;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown>; }
  catch { return {}; }
}

async function send(path: string, init: RequestInit = {}, retried = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${getToken()}`,
  };
  const res = await fetch(path, { ...init, cache: 'no-store', headers });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return send(path, init, true);
  }
  const body = await readJson(res);
  if (!res.ok) {
    const msg = typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body;
}

export async function fetchPartnerFirms(): Promise<PartnerFirm[]> {
  const body = await send(ROUTE);
  return Array.isArray(body.firms) ? (body.firms as PartnerFirm[]) : [];
}

export async function pushPartners(rows: PartnerPushRow[]): Promise<PartnerPushResult> {
  const body = await send(ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clients: rows }),
  });
  const counts = (body.clients ?? {}) as Partial<PartnerPushResult>;
  return {
    received: counts.received ?? 0,
    created: counts.created ?? 0,
    linked: counts.linked ?? 0,
    updated: counts.updated ?? 0,
    skipped: Array.isArray(body.skipped) ? (body.skipped as PartnerPushResult['skipped']) : [],
  };
}

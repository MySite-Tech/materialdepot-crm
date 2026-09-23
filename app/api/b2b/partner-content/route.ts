import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const B2B_ROLES = new Set(['admin', 'b2b_sales']);

const TONES = new Set(['brand', 'good', 'warn', 'info', 'ink']);
const KINDS = new Set(['product', 'design', 'initiative', 'offer', 'event', 'tool']);

const MAX_ROWS = 200;
const MAX_TITLE = 120;
const MAX_IMAGE_CHARS = 11_000_000;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

class AccessError extends Error {}

const accessErrorResponse = (err: unknown) =>
  err instanceof AccessError ? Response.json({ error: err.message }, { status: 403 }) : null;

function authorise(caller: Caller): void {
  if (!B2B_ROLES.has(caller.role)) {
    throw new AccessError('Only the B2B team can publish to the partner dashboards');
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

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function checkRow(row: Record<string, unknown>, kind: 'banner' | 'launch'): string | null {
  const id = text(row.md_ref, 80);
  if (!id) return 'Every row needs an md_ref';
  if (!text(row.title, MAX_TITLE)) return `${id}: a title is required`;
  if (kind === 'banner' && row.tone !== undefined && !TONES.has(String(row.tone))) {
    return `${id}: ${String(row.tone)} is not a tone the partner dashboard can draw`;
  }
  if (kind === 'launch' && row.kind !== undefined && !KINDS.has(String(row.kind))) {
    return `${id}: ${String(row.kind)} is not a kind of launch`;
  }
  for (const key of ['starts_on', 'ends_on', 'launched_on']) {
    const value = row[key];
    if (value === undefined || value === null || value === '') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${id}: ${key} must be a date`;
  }
  for (const key of ['cta_href', 'href']) {
    const value = row[key];
    if (value === undefined || value === null || value === '') continue;
    const href = String(value);
    if (!/^(https?:\/\/|\/)/.test(href)) {
      return `${id}: ${key} must start with https:// or be a path beginning with /`;
    }
  }
  const image = row.image_data;
  if (typeof image === 'string' && image.length > MAX_IMAGE_CHARS) {
    return `${id}: that image is too large — 8MB is the limit`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    authorise(await requireCaller(request));
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  const target = endpoint();
  if (target instanceof Response) return target;

  return relay(`${target.base}/api/sync/content`, target.secret);
}

export async function POST(request: NextRequest) {
  try {
    authorise(await requireCaller(request));
  } catch (err) {
    return sessionErrorResponse(err) ?? accessErrorResponse(err) ?? bad('Not authenticated', 401);
  }

  const target = endpoint();
  if (target instanceof Response) return target;

  let body: { banners?: unknown; launches?: unknown; remove?: unknown };
  try {
    body = (await request.json()) as { banners?: unknown; launches?: unknown; remove?: unknown };
  } catch {
    return bad('Bad request body');
  }

  const banners = Array.isArray(body.banners) ? (body.banners as Record<string, unknown>[]) : [];
  const launches = Array.isArray(body.launches) ? (body.launches as Record<string, unknown>[]) : [];
  const remove = (body.remove ?? {}) as { banners?: unknown; launches?: unknown };
  const dropBanners = Array.isArray(remove.banners) ? remove.banners.map(String) : [];
  const dropLaunches = Array.isArray(remove.launches) ? remove.launches.map(String) : [];

  if (!banners.length && !launches.length && !dropBanners.length && !dropLaunches.length) {
    return bad('Nothing to publish');
  }
  if (banners.length > MAX_ROWS || launches.length > MAX_ROWS) {
    return bad(`Send at most ${MAX_ROWS} rows of each kind in one push`);
  }

  for (const row of banners) {
    const problem = checkRow(row, 'banner');
    if (problem) return bad(problem);
  }
  for (const row of launches) {
    const problem = checkRow(row, 'launch');
    if (problem) return bad(problem);
  }

  return relay(`${target.base}/api/sync/content`, target.secret, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      banners,
      launches,
      remove: { banners: dropBanners, launches: dropLaunches },
    }),
  });
}

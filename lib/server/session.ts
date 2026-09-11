import { cleanup, getCached, setCache } from './cache';
import { roleFromPermission } from '../api/crm/roles';

const API_BASE = process.env.API_BASE_URL || 'https://api-dev2.materialdepot.in/apiV1';

const SESSION_TTL_MS = 30_000;

export class SessionError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export interface Caller {
  userOrgId: number | string;
  userId: number;
  name: string;
  phone: string;
  role: string;
  allowedBranches: string[];
  individualPermissions: string[];
}

interface OrgRow {
  id?: number | string;
  user?: { id?: unknown; f_name?: unknown; l_name?: unknown; contact?: unknown } | null;
  branch?: Array<{ branch_name?: unknown }> | null;
  user_permission_detail?: { id?: unknown; permission_name?: unknown } | null;
  individual_permissions?: unknown;
  status?: unknown;
}

function bearerToken(request: Request): string {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new SessionError('Not authenticated');
  return token;
}

function userIdFromToken(token: string): number {
  const segment = token.split('.')[1];
  if (!segment) throw new SessionError('Malformed token');

  let claims: { user_id?: unknown; exp?: unknown };
  try {
    const json = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    claims = JSON.parse(json) as { user_id?: unknown; exp?: unknown };
  } catch {
    throw new SessionError('Malformed token');
  }

  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
    throw new SessionError('Session expired');
  }

  const userId = Number(claims.user_id);
  if (!Number.isInteger(userId)) throw new SessionError('Token carries no user_id');
  return userId;
}

async function fetchRoster(token: string): Promise<OrgRow[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user-organisation/`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    throw new SessionError('Could not reach the backend to verify this session', 502);
  }

  if (res.status === 401 || res.status === 403) throw new SessionError('Session rejected by the backend');
  if (!res.ok) throw new SessionError(`Could not verify this session (${res.status})`, 502);

  const body: unknown = await res.json().catch(() => null);
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown })?.data)
      ? (body as { data: unknown[] }).data
      : null;
  if (!rows) throw new SessionError('Could not verify this session', 502);
  return rows as OrgRow[];
}

function toCaller(row: OrgRow, userId: number): Caller {
  const first = String(row.user?.f_name ?? '').trim();
  const last = String(row.user?.l_name ?? '').trim();
  const contact = String(row.user?.contact ?? '');
  return {
    userOrgId: row.id ?? 0,
    userId,
    name: [first, last].filter(Boolean).join(' ') || contact,
    phone: contact,
    role: roleFromPermission(row.user_permission_detail),
    allowedBranches: (row.branch ?? [])
      .map((b) => String(b?.branch_name ?? '').trim())
      .filter(Boolean),
    individualPermissions: Array.isArray(row.individual_permissions)
      ? (row.individual_permissions as unknown[]).filter((p): p is string => typeof p === 'string')
      : [],
  };
}

export async function requireCaller(request: Request): Promise<Caller> {
  const token = bearerToken(request);
  const userId = userIdFromToken(token);

  cleanup();
  const key = `session:${userId}:${token.slice(-24)}`;
  const cached = getCached(key) as Caller | null;
  if (cached) return cached;

  const row = (await fetchRoster(token)).find((r) => Number(r.user?.id) === userId);
  if (!row) throw new SessionError('This account is not on the organisation roster', 403);
  if (row.status === false) throw new SessionError('This account is inactive', 403);

  const caller = toCaller(row, userId);
  setCache(key, caller, SESSION_TTL_MS);
  return caller;
}

export function sessionErrorResponse(err: unknown): Response | null {
  if (!(err instanceof SessionError)) return null;
  return Response.json({ error: err.message }, { status: err.status });
}

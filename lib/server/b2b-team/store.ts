import { B2BBackendError, b2bBackendFetch } from '@/lib/server/b2b-backend';
import type { B2BTeam, TeamMember, TeamState } from '@/lib/b2b/team/types';

export class TeamTableMissing extends Error {
  constructor() {
    super('The B2B backend has no team tables yet — deploy b2b-backend migration 0020');
  }
}

const missing = (e: unknown) => e instanceof B2BBackendError && e.status === 404;

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  try {
    return await b2bBackendFetch<T>(path, init);
  } catch (e) {
    if (missing(e)) throw new TeamTableMissing();
    throw e;
  }
}

type MemberRow = {
  phone: string;
  name: string;
  team: B2BTeam;
  kylas_user_id: number | null;
  kylas_name: string | null;
  in_rotation: boolean;
  active: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

const toMember = (r: MemberRow): TeamMember => ({
  phone: r.phone,
  name: r.name,
  team: r.team,
  kylasUserId: r.kylas_user_id == null ? null : Number(r.kylas_user_id),
  kylasName: r.kylas_name,
  inRotation: r.in_rotation,
  active: r.active,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export async function readMembers(): Promise<TeamState> {
  try {
    const { members } = await call<{ members: MemberRow[] }>('/team');
    return { members: members.map(toMember), tableMissing: false };
  } catch (e) {
    if (e instanceof TeamTableMissing) return { members: [], tableMissing: true };
    throw e;
  }
}

export async function upsertMember(m: Omit<TeamMember, 'updatedAt'>): Promise<TeamMember> {
  const row = await call<MemberRow>('/team', {
    method: 'PUT',
    body: {
      phone: m.phone,
      name: m.name,
      team: m.team,
      kylas_user_id: m.kylasUserId,
      kylas_name: m.kylasName,
      in_rotation: m.inRotation,
      active: m.active,
      updated_by: m.updatedBy,
    },
  });
  return toMember(row);
}

export async function lastRoundRobinKylasId(): Promise<number | null> {
  const { to_kylas_id } = await call<{ to_kylas_id: number | null }>('/assignments/last-round-robin');
  return to_kylas_id == null ? null : Number(to_kylas_id);
}

export async function assignedLeadIdsSince(sinceIso: string): Promise<Set<string>> {
  const { lead_ids } = await call<{ lead_ids: string[] }>(`/assignments/lead-ids?since=${encodeURIComponent(sinceIso)}`);
  return new Set(lead_ids.map(String));
}

export async function workedInboundLeadIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const res = await call<{ ids: string[] }>('/inbound/worked', { method: 'POST', body: { ids } });
  return new Set(res.ids.map(String));
}

export interface AssignmentRow {
  lead_id: string;
  lead_created_at: string | null;
  kind: 'round_robin' | 'reassign';
  to_kylas_id: number;
  to_name: string;
  from_kylas_id: number | null;
  reason: string | null;
  by_name: string;
}

export async function claimRoundRobin(row: AssignmentRow): Promise<number | null> {
  try {
    const { id } = await call<{ id: number }>('/assignments', { method: 'POST', body: row });
    return Number(id);
  } catch (e) {
    if (e instanceof B2BBackendError && e.status === 409) return null;
    throw e;
  }
}

export async function releaseClaim(id: number): Promise<void> {
  await call(`/assignments/${id}`, { method: 'DELETE' });
}

export async function recordAssignment(row: AssignmentRow): Promise<void> {
  await call('/assignments', { method: 'POST', body: row });
}

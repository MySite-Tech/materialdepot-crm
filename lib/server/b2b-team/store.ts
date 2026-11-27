import { B2BBackendError, b2bBackendFetch } from '@/lib/server/b2b-backend';
import type { B2BTeam, RenumberOutcome, TeamMember, TeamState } from '@/lib/b2b/team/types';

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
  is_admin?: boolean;
  is_primary?: boolean;
  starts_on?: string | null;
  ends_on?: string | null;
  paused_from?: string | null;
  paused_to?: string | null;
  joined_on?: string | null;
  left_on?: string | null;
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
  isAdmin: r.is_admin === true,
  primary: r.is_primary === true,
  from: r.starts_on ?? null,
  to: r.ends_on ?? null,
  pausedFrom: r.paused_from ?? null,
  pausedTo: r.paused_to ?? null,
  joinedOn: r.joined_on ?? null,
  leftOn: r.left_on ?? null,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export async function readMembers(): Promise<TeamState> {
  try {
    const { members } = await call<{ members: MemberRow[] }>('/team');
    return {
      members: members.map(toMember),
      tableMissing: false,
      coverReady: !members.length || 'is_primary' in members[0],
      pauseReady: !members.length || 'paused_from' in members[0],
      tenureReady: !members.length || 'joined_on' in members[0],
    };
  } catch (e) {
    if (e instanceof TeamTableMissing) return { members: [], tableMissing: true, coverReady: false, pauseReady: false, tenureReady: false };
    throw e;
  }
}

type MemberWrite = Omit<TeamMember, 'updatedAt' | 'isAdmin' | 'primary' | 'from' | 'to' | 'pausedFrom' | 'pausedTo' | 'joinedOn' | 'leftOn'>
  & { isAdmin?: boolean; cover?: Pick<TeamMember, 'primary' | 'from' | 'to'>; pause?: Pick<TeamMember, 'pausedFrom' | 'pausedTo'>; tenure?: Partial<Pick<TeamMember, 'joinedOn' | 'leftOn'>> };

export async function upsertMember(m: MemberWrite): Promise<TeamMember> {
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
      is_admin: m.isAdmin,
      ...(m.cover ? { is_primary: m.cover.primary, starts_on: m.cover.from, ends_on: m.cover.to } : {}),
      ...(m.pause ? { paused_from: m.pause.pausedFrom, paused_to: m.pause.pausedTo } : {}),
      ...(m.tenure && 'joinedOn' in m.tenure ? { joined_on: m.tenure.joinedOn } : {}),
      ...(m.tenure && 'leftOn' in m.tenure ? { left_on: m.tenure.leftOn } : {}),
      updated_by: m.updatedBy,
    },
  });
  return toMember(row);
}

export async function renumberMember(from: string, to: string, updatedBy: string): Promise<RenumberOutcome> {
  const res = await b2bBackendFetch<{ moved_teams: B2BTeam[]; merged_teams: B2BTeam[]; rows: Record<string, number> }>(
    '/team/renumber',
    { method: 'POST', body: { from, to, updated_by: updatedBy } },
  );
  return { movedTeams: res.moved_teams, mergedTeams: res.merged_teams, firms: res.rows.client ?? 0, outreachLeads: res.rows.outbound ?? 0 };
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

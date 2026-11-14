import { getToken, refreshSession } from '@/lib/api/core/client';
import type { InboundLead } from '@/components/b2b/models/mock-data';
import type { KylasOwnerWrites, KylasUser, MemberInput, ReassignOutcome, RenumberOutcome, RotationOutcome, SavedMember, SyncOutcome, TeamState } from './types';

async function send<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${getToken()}`,
  };
  const res = await fetch(path, { ...init, cache: 'no-store', headers });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return send<T>(path, init, true);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`);
  }
  return body as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const fetchTeam = (): Promise<TeamState> => send<TeamState>('/api/b2b/team');

export const fetchKylasUsers = (): Promise<KylasUser[]> =>
  send<{ kylasUsers: KylasUser[] }>('/api/b2b/team?kylasUsers=1').then((b) => b.kylasUsers);

export const saveTeamMember = (input: MemberInput): Promise<SavedMember> =>
  send<SavedMember>('/api/b2b/team', json('PUT', input));

export const changeTeamMemberNumber = (from: string, to: string): Promise<RenumberOutcome> =>
  send<RenumberOutcome>('/api/b2b/team', json('POST', { from, to }));

export const runInboundRotation = (dryRun = false, backlog = false): Promise<RotationOutcome> =>
  send<RotationOutcome>('/api/b2b/inbound/assign', json('POST', { mode: 'rotate', dryRun, backlog }));

export const syncInbound = (full = false): Promise<SyncOutcome> =>
  send<SyncOutcome>('/api/b2b/inbound/assign', json('POST', { mode: 'sync', full }));

export const reassignInboundLeads = (items: { leadId: string; toPhone: string }[], reason: string): Promise<ReassignOutcome> =>
  send<ReassignOutcome>('/api/b2b/inbound/assign', json('POST', { mode: 'reassign-many', items, reason }));

export const reassignInboundLead = (leadId: string, toPhone: string, reason: string): Promise<{ to: string; kylas?: KylasOwnerWrites }> =>
  send<{ to: string; kylas?: KylasOwnerWrites }>('/api/b2b/inbound/assign', json('POST', { mode: 'reassign', leadId, toPhone, reason }));

export async function moveInboundLeads(
  plan: { lead: InboundLead; toPhone: string }[],
  reason: string,
): Promise<{ moved: InboundLead[]; failed: ReassignOutcome['failed']; kylas?: KylasOwnerWrites }> {
  const outcome = await reassignInboundLeads(plan.map(({ lead, toPhone }) => ({ leadId: lead.id, toPhone })), reason);
  const byId = new Map(outcome.moved.map((m) => [m.leadId, m]));
  const moved = plan.flatMap(({ lead }) => {
    const m = byId.get(lead.id);
    return m ? [{ ...lead, owner: m.name, ownerId: m.kylasUserId }] : [];
  });
  return { moved, failed: outcome.failed, kylas: outcome.kylas };
}

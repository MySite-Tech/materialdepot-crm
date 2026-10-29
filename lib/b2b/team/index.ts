import { getToken, refreshSession } from '@/lib/api/core/client';
import type { KylasUser, MemberInput, RotationOutcome, SavedMember, TeamState } from './types';

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

export const runInboundRotation = (dryRun = false): Promise<RotationOutcome> =>
  send<RotationOutcome>('/api/b2b/inbound/assign', json('POST', { mode: 'rotate', dryRun }));

export const reassignInboundLead = (leadId: string, toPhone: string, reason: string): Promise<{ to: string }> =>
  send<{ to: string }>('/api/b2b/inbound/assign', json('POST', { mode: 'reassign', leadId, toPhone, reason }));

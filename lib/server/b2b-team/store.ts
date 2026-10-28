import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { B2BTeam, TeamMember, TeamState } from '@/lib/b2b/team/types';

const MEMBERS = 'b2b_team_member';
const ASSIGNMENTS = 'b2b_lead_assignment';
const MEMBER_COLS = 'phone, name, team, kylas_user_id, kylas_name, in_rotation, active, updated_at, updated_by';

let _admin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

type PgError = { code?: string; message: string } | null;

const isMissingTable = (e: PgError) => !!e && (e.code === '42P01' || e.code === 'PGRST205');

export class TeamTableMissing extends Error {
  constructor() {
    super('The B2B team tables are not set up yet — run supabase/migrations/b2b-team.sql');
  }
}

function check(error: PgError): void {
  if (!error) return;
  if (isMissingTable(error)) throw new TeamTableMissing();
  throw new Error(error.message);
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
  const { data, error } = await admin().from(MEMBERS).select(MEMBER_COLS).order('name').order('phone');
  if (isMissingTable(error)) return { members: [], tableMissing: true };
  check(error);
  return { members: ((data ?? []) as MemberRow[]).map(toMember), tableMissing: false };
}

export async function upsertMember(m: Omit<TeamMember, 'updatedAt'>): Promise<TeamMember> {
  const { data, error } = await admin()
    .from(MEMBERS)
    .upsert({
      phone: m.phone,
      name: m.name,
      team: m.team,
      kylas_user_id: m.kylasUserId,
      kylas_name: m.kylasName,
      in_rotation: m.inRotation,
      active: m.active,
      updated_at: new Date().toISOString(),
      updated_by: m.updatedBy,
    }, { onConflict: 'phone' })
    .select(MEMBER_COLS)
    .single();
  check(error);
  return toMember(data as MemberRow);
}

export async function lastRoundRobinKylasId(): Promise<number | null> {
  const { data, error } = await admin()
    .from(ASSIGNMENTS)
    .select('to_kylas_id')
    .eq('kind', 'round_robin')
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  check(error);
  const row = (data ?? [])[0] as { to_kylas_id: number } | undefined;
  return row ? Number(row.to_kylas_id) : null;
}

export async function assignedLeadIdsSince(sinceIso: string): Promise<Set<string>> {
  const { data, error } = await admin()
    .from(ASSIGNMENTS)
    .select('lead_id')
    .gte('lead_created_at', sinceIso);
  check(error);
  return new Set(((data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
}

export async function workedInboundLeadIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await admin()
    .from('b2b_lead')
    .select('kylas_lead_id')
    .eq('pipeline', 'inbound')
    .neq('stage', 'New')
    .in('kylas_lead_id', ids);
  check(error);
  return new Set(((data ?? []) as { kylas_lead_id: string }[]).map((r) => r.kylas_lead_id));
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
  const { data, error } = await admin().from(ASSIGNMENTS).insert(row).select('id').single();
  if (error?.code === '23505') return null;
  check(error);
  return Number((data as { id: number }).id);
}

export async function releaseClaim(id: number): Promise<void> {
  const { error } = await admin().from(ASSIGNMENTS).delete().eq('id', id);
  check(error);
}

export async function recordAssignment(row: AssignmentRow): Promise<void> {
  const { error } = await admin().from(ASSIGNMENTS).insert(row);
  check(error);
}

import { normalisePhone } from '@/lib/org/utils';
import { B2B_ACCESS_SLUG, B2B_MANAGER_ROLES, B2B_MANAGER_SLUG, B2B_REP_ROLE_TEAM, B2B_SALES_ROLES, IST_OFFSET_MS, PLACEHOLDER_NAMES } from './constants';
import { B2BTeam, B2BUser, KylasOwnerWrites, SignInGaps, TeamMember, Viewer } from './types';

const perms = (u: B2BUser): string[] =>
  Array.isArray(u.individualPermissions) ? u.individualPermissions : [];

export const canUseB2B = (u: B2BUser): boolean => {
  const p = perms(u);
  return p.length > 0 ? p.includes(B2B_ACCESS_SLUG) : B2B_SALES_ROLES.has(u.role);
};

export const isB2BManager = (u: B2BUser): boolean =>
  B2B_MANAGER_ROLES.has(u.role) || perms(u).includes(B2B_MANAGER_SLUG);

export const memberForPhone = (members: TeamMember[], phone: string): TeamMember | null => {
  const want = normalisePhone(phone);
  if (want.length !== 10) return null;
  return members.find((m) => m.phone === want) ?? null;
};

export const membershipsForPhone = (members: TeamMember[], phone: string): TeamMember[] => {
  const want = normalisePhone(phone);
  return want.length === 10 ? members.filter((m) => m.phone === want && m.active) : [];
};

export const istDay = (ms = Date.now()): string => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

export const isCover = (m: Pick<TeamMember, 'from' | 'to'>): boolean => !!(m.from || m.to);

export const onDuty = (m: TeamMember, day: string = istDay()): boolean =>
  m.active && (!m.from || m.from <= day) && (!m.to || day <= m.to);

export const onDutyIn = (members: TeamMember[], team: B2BTeam, day: string = istDay()): TeamMember[] =>
  members.filter((m) => m.team === team && onDuty(m, day));

export type CoverState = 'upcoming' | 'covering' | 'ended';

type Window = Pick<TeamMember, 'from' | 'to'>;

export const coverState = (m: Window, day: string = istDay()): CoverState | null =>
  !isCover(m) ? null : m.from && day < m.from ? 'upcoming' : m.to && day > m.to ? 'ended' : 'covering';

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function coverLabel(m: Window, day: string = istDay()): string {
  const span = m.from && m.to ? `${fmtDay(m.from)} – ${fmtDay(m.to)}` : m.from ? `from ${fmtDay(m.from)}` : `until ${fmtDay(m.to as string)}`;
  const state = coverState(m, day);
  return state === 'ended' ? `Cover ended ${fmtDay(m.to as string)}` : state === 'upcoming' ? `Covers ${span}` : `Covering ${span}`;
}

export const primaryOf = (rows: TeamMember[]): TeamMember | null =>
  rows.find((m) => m.primary) ?? null;

export const viewerFor = (user: B2BUser | null, members: TeamMember[]): Viewer => {
  const memberships = user ? membershipsForPhone(members, user.phone) : [];
  const canManageTeam = user ? isB2BManager(user) : false;
  const today = istDay();
  return {
    name: user?.name ?? '',
    phone: normalisePhone(user?.phone),
    isManager: canManageTeam || memberships.some((m) => m.isAdmin),
    canManageTeam,
    member: memberships.find((m) => coverState(m, today) === 'covering') ?? primaryOf(memberships) ?? memberships[0] ?? null,
    memberships,
  };
};

export const membershipIn = (viewer: Viewer, team: B2BTeam): TeamMember | null =>
  viewer.memberships.find((m) => m.team === team) ?? null;

export const teamMembers = (members: TeamMember[], team: B2BTeam): TeamMember[] =>
  members
    .filter((m) => m.team === team && m.kylasUserId != null)
    .sort((a, b) => a.name.localeCompare(b.name) || a.phone.localeCompare(b.phone));

export const rotationOrder = (members: TeamMember[], day: string = istDay()): TeamMember[] =>
  teamMembers(members, 'inbound').filter((m) => onDuty(m, day) && m.inRotation);

export function planRotation<T>(
  leads: T[],
  order: TeamMember[],
  lastKylasId: number | null,
): { lead: T; member: TeamMember }[] {
  if (!order.length) return [];
  const last = order.findIndex((m) => m.kylasUserId === lastKylasId);
  return leads.map((lead, i) => ({ lead, member: order[(last + 1 + i) % order.length] }));
}

export const isPlaceholderName = (name?: string | null): boolean => {
  const n = String(name ?? '').trim().toLowerCase();
  return PLACEHOLDER_NAMES.has(n) || /^\d+$/.test(n);
};

export function signInGaps(users: (B2BUser & { id: string | number; active?: boolean })[], members: TeamMember[]): SignInGaps {
  const live = users.filter((u) => u.active !== false && normalisePhone(u.phone).length === 10);
  const loginPhones = new Set(live.map((u) => normalisePhone(u.phone)));
  const teamPhones = new Set(members.filter((m) => m.active).map((m) => m.phone));
  const everTeamed = new Set(members.map((m) => m.phone));
  const reps = live.filter((u) => u.role in B2B_REP_ROLE_TEAM && canUseB2B(u));
  return {
    unteamed: reps
      .filter((u) => !everTeamed.has(normalisePhone(u.phone)))
      .map((user) => ({ user, suggest: B2B_REP_ROLE_TEAM[user.role] }))
      .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    noLogin: members.filter((m) => m.active && !loginPhones.has(m.phone)),
    placeholder: live.filter((u) => isPlaceholderName(u.name) && (teamPhones.has(normalisePhone(u.phone)) || u.role in B2B_REP_ROLE_TEAM)),
  };
}

export function kylasOwnerNote(k?: KylasOwnerWrites): string | null {
  if (!k || (!k.failed.length && !k.pending)) return null;
  const leads = (n: number) => `${n} lead${n === 1 ? '' : 's'}`;
  const parts = [
    k.failed.length ? `Kylas refused the new owner on ${leads(k.failed.length)} (${k.failed[0].error})` : '',
    k.pending ? `${leads(k.pending)} not yet written to Kylas, because it is rate limiting` : '',
  ].filter(Boolean);
  return `${parts.join('. ')}. The CRM owner is right; Kylas still shows the old one.`;
}

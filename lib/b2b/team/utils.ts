import { normalisePhone } from '@/lib/org/utils';
import { B2B_ACCESS_SLUG, B2B_MANAGER_ROLES, B2B_MANAGER_SLUG, B2B_SALES_ROLES } from './constants';
import { B2BTeam, B2BUser, TeamMember, Viewer } from './types';

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

export const viewerFor = (user: B2BUser | null, members: TeamMember[]): Viewer => {
  const memberships = user ? membershipsForPhone(members, user.phone) : [];
  const canManageTeam = user ? isB2BManager(user) : false;
  return {
    name: user?.name ?? '',
    phone: normalisePhone(user?.phone),
    isManager: canManageTeam || memberships.some((m) => m.isAdmin),
    canManageTeam,
    member: memberships[0] ?? null,
    memberships,
  };
};

export const membershipIn = (viewer: Viewer, team: B2BTeam): TeamMember | null =>
  viewer.memberships.find((m) => m.team === team) ?? null;

export const teamMembers = (members: TeamMember[], team: B2BTeam): TeamMember[] =>
  members
    .filter((m) => m.team === team && m.kylasUserId != null)
    .sort((a, b) => a.name.localeCompare(b.name) || a.phone.localeCompare(b.phone));

export const rotationOrder = (members: TeamMember[]): TeamMember[] =>
  teamMembers(members, 'inbound').filter((m) => m.active && m.inRotation);

export function planRotation<T>(
  leads: T[],
  order: TeamMember[],
  lastKylasId: number | null,
): { lead: T; member: TeamMember }[] {
  if (!order.length) return [];
  const last = order.findIndex((m) => m.kylasUserId === lastKylasId);
  return leads.map((lead, i) => ({ lead, member: order[(last + 1 + i) % order.length] }));
}

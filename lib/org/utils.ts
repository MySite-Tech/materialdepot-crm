import { STAKEHOLDERS, STAKEHOLDER_ORDER } from './constants';
import { OrgPerson, OrgTeam, StakeholderRole } from './types';
import { AppUser } from '@/types/crm';

const CRM_ROLE_TO_STAKEHOLDER: Record<string, StakeholderRole> = Object.fromEntries(
  STAKEHOLDER_ORDER.flatMap((role) => STAKEHOLDERS[role].crmRoles.map((crm) => [crm, role])),
);

export const stakeholderForCrmRole = (crmRole?: string | null): StakeholderRole | null =>
  CRM_ROLE_TO_STAKEHOLDER[(crmRole ?? '').trim()] ?? null;

export const stakeholderLabel = (role: StakeholderRole | null): string =>
  role ? STAKEHOLDERS[role].label : 'Not on the store hierarchy';

export const depthOf = (role: StakeholderRole | null): number =>
  role ? STAKEHOLDERS[role].depth : -1;

export const checkerOf = (role: StakeholderRole | null): StakeholderRole | null =>
  role ? STAKEHOLDERS[role].reportsTo : null;

export const normalisePhone = (phone?: string | null): string => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const normaliseName = (name?: string | null): string =>
  String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const samePerson = (a?: string | null, b?: string | null): boolean => {
  const left = normalisePhone(a);
  return left.length > 0 && left === normalisePhone(b);
};

const branchesOverlap = (viewer: string[], subject: string[]): boolean => {
  if (viewer.length === 0 || subject.length === 0) return true;
  const scope = new Set(viewer.map((b) => b.trim().toLowerCase()));
  return subject.some((b) => scope.has(b.trim().toLowerCase()));
};

export const canViewReportCardOf = (viewer: AppUser, subject: AppUser): boolean => {
  if (samePerson(viewer.phone, subject.phone)) return true;
  const viewerRole = stakeholderForCrmRole(viewer.role);
  const subjectRole = stakeholderForCrmRole(subject.role);
  if (!viewerRole || !subjectRole) return false;
  if (depthOf(viewerRole) <= depthOf(subjectRole)) return false;
  return branchesOverlap(viewer.allowedBranches ?? [], subject.allowedBranches ?? []);
};

export const toOrgPerson = (user: AppUser): OrgPerson => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  crmRole: user.role,
  stakeholder: stakeholderForCrmRole(user.role),
  branches: user.allowedBranches ?? [],
});

const seniority = (role: StakeholderRole | null): number =>
  role ? STAKEHOLDER_ORDER.indexOf(role) : STAKEHOLDER_ORDER.length;

export const buildTeam = (roster: AppUser[], viewer: AppUser): OrgTeam => {
  const mine = roster.find((u) => samePerson(u.phone, viewer.phone));
  const reports = roster
    .filter((u) => u.active !== false && !samePerson(u.phone, viewer.phone) && canViewReportCardOf(viewer, u))
    .map(toOrgPerson)
    .sort((a, b) => seniority(a.stakeholder) - seniority(b.stakeholder) || a.name.localeCompare(b.name));
  return {
    me: toOrgPerson(mine ?? viewer),
    reports,
    unmappedRole: stakeholderForCrmRole(viewer.role) === null,
  };
};

export const positionsPresent = (people: OrgPerson[]): StakeholderRole[] => {
  const seen = new Set(people.map((p) => p.stakeholder).filter((r): r is StakeholderRole => r !== null));
  return STAKEHOLDER_ORDER.filter((role) => seen.has(role));
};

export const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

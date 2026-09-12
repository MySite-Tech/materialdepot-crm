export type StakeholderRole = 'bm' | 'receptionist' | 'tl' | 'asm' | 'sm' | 'central';

export type StakeholderTier = 'Frontline' | 'Store leadership' | 'Central';

export interface Stakeholder {
  code: string;
  label: string;
  tier: StakeholderTier;
  depth: number;
  reportsTo: StakeholderRole | null;
  alsoVisibleTo: StakeholderRole[];
  crmRoles: string[];
  owns: string;
  reviewedOn: string;
}

export interface OrgPerson {
  id: string | number;
  name: string;
  phone: string;
  crmRole: string;
  stakeholder: StakeholderRole | null;
  branches: string[];
}

export interface OrgTeam {
  me: OrgPerson | null;
  reports: OrgPerson[];
  unmappedRole: boolean;
}

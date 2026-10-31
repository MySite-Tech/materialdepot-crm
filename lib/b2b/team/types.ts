export type B2BTeam = 'inbound' | 'outreach' | 'kam';

export interface TeamMember {
  phone: string;
  name: string;
  team: B2BTeam;
  kylasUserId: number | null;
  kylasName: string | null;
  inRotation: boolean;
  active: boolean;
  isAdmin: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface TeamState {
  members: TeamMember[];
  tableMissing: boolean;
}

export interface KylasUser {
  id: number;
  name: string;
  phone: string;
  active: boolean;
}

export interface MemberInput {
  phone: string;
  name: string;
  team: B2BTeam;
  inRotation: boolean;
  active: boolean;
  kylasUserId?: number | null;
  isAdmin?: boolean;
}

export interface SavedMember {
  member: TeamMember;
  warning?: string;
}

export interface RotationOutcome {
  dryRun: boolean;
  assigned: { leadId: string; to: string }[];
  failed: { leadId: string; error: string }[];
  waiting: number;
  skipped?: string;
}

export interface ReassignOutcome {
  moved: { leadId: string; name: string; kylasUserId: number }[];
  failed: { leadId: string; error: string }[];
}

export interface B2BUser {
  name: string;
  phone: string;
  role: string;
  individualPermissions?: string[];
}

export interface Viewer {
  name: string;
  phone: string;
  isManager: boolean;
  canManageTeam: boolean;
  member: TeamMember | null;
  memberships: TeamMember[];
}

export interface B2BTeamLoad extends TeamState {
  loading: boolean;
  error: string | null;
  reload: () => void;
}

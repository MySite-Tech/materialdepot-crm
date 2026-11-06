import { apptBranchesFromCrm } from '@/lib/appointments/appt-shared';
import { depthOf, stakeholderForCrmRole } from '@/lib/org/utils';
import type { B2BUser } from '../team/types';
import { isB2BManager } from '../team/utils';
import { ADMIN_VIEW_DEPTH, STORE_VIEW_DEPTH } from './constants';

type Who = B2BUser & { allowedBranches?: string[] };

const depth = (u: Who) => depthOf(stakeholderForCrmRole(u.role));

export const canSeeStoreReferrals = (u: Who): boolean => depth(u) >= STORE_VIEW_DEPTH || isB2BManager(u);

export const canSeeAllReferrals = (u: Who): boolean => depth(u) >= ADMIN_VIEW_DEPTH || isB2BManager(u);

export function storeEcs(u: Who): string[] | null {
  const branches = (u.allowedBranches ?? []).filter(Boolean);
  if (canSeeAllReferrals(u) || !branches.length) return null;
  return apptBranchesFromCrm(branches);
}

export function ecMatches(name: string | undefined, ecs: string[] | null): boolean {
  if (!ecs) return true;
  const canon = apptBranchesFromCrm([String(name ?? '')]);
  return canon.length === 1 && ecs.includes(canon[0]);
}

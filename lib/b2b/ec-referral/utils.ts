import type { B2BUser } from '@/lib/b2b/team/types';
import { EC_REFERRAL_ROLES, EC_REFERRAL_SLUG } from './constants';

export const canReferToB2B = (u: B2BUser): boolean => {
  const p = Array.isArray(u.individualPermissions) ? u.individualPermissions : [];
  return p.length > 0 ? p.includes(EC_REFERRAL_SLUG) : EC_REFERRAL_ROLES.has(u.role);
};

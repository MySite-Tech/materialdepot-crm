import { phoneKey } from '.';

export const CRM_ROLE_TO_SITE_AUDIT_ROLE: Record<string, string | null> = {
  accounts: null,
  retail: null,
  customer_success: null,
  data: null,
  pre_sales: null,
  b2b_KAM: 'bm',
  b2b_manager: 'bm',
  b2b_sales: 'bm',
  sales: 'bm',
  delivery: 'service_mgr',
  delivery_manager: 'service_mgr',
  post_sales: 'service_mgr',
  procurement: 'service_mgr',
  manager: 'branch_mgr',
  store_manager: 'branch_mgr',
};

export const FIELD_WORKER_SKIP = 'skip' as const;

export const OVERSIGHT_CRM_ROLES = new Set(['admin', 'superadmin', 'tech']);

export function siteAuditTargetForCrmPermission(perm: string): string | null | typeof FIELD_WORKER_SKIP {
  if (perm === 'field_worker') return FIELD_WORKER_SKIP;
  if (OVERSIGHT_CRM_ROLES.has(perm)) return FIELD_WORKER_SKIP;
  if (perm in CRM_ROLE_TO_SITE_AUDIT_ROLE) return CRM_ROLE_TO_SITE_AUDIT_ROLE[perm];
  return FIELD_WORKER_SKIP;
}

const PROTECTED_ROLES = new Set(['store_staff', 'coe', 'content_team', 'service_mgr']);

const FIELD_WORK_ROLES = new Set(['site_auditor', 'installer', 'auditor_installer']);

export type SiteAuditRoleSyncCrmUser = { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[]; active?: boolean };
export type SiteAuditRoleSyncProfile = { id: string; name: string; email: string; role: string; contact: string | null };

export type SiteAuditRoleSyncPlan = {
  ready: Array<{ profileId: string; name: string; email: string; crmPermission: string; currentRole: string; targetRole: string; branch: string | null }>;
  noProfileYet: Array<{ crmUserId: string | number; name: string; phone: string; crmPermission: string; targetRole: string; branch: string | null }>;
  skipped: Array<{ name: string; reason: 'field_worker' | 'protected_role' | 'field_work_role' | 'oversight_role' | 'ambiguous_phone' | 'unmapped_permission' }>;
  noLongerEntitled: Array<{ profileId: string; name: string; email: string; currentRole: string; crmPermission: string }>;
};

export function planSiteAuditRoleSync(
  allCrmUsers: SiteAuditRoleSyncCrmUser[],
  profiles: SiteAuditRoleSyncProfile[],
): SiteAuditRoleSyncPlan {
  const plan: SiteAuditRoleSyncPlan = { ready: [], noProfileYet: [], skipped: [], noLongerEntitled: [] };

  const crmUsers = allCrmUsers.filter((u) => u.active !== false);

  const profilesByPhone = new Map<string, SiteAuditRoleSyncProfile[]>();
  for (const p of profiles) {
    const key = phoneKey(p.contact);
    if (!key) continue;
    const list = profilesByPhone.get(key) || [];
    list.push(p);
    profilesByPhone.set(key, list);
  }
  const crmByPhone = new Map<string, SiteAuditRoleSyncCrmUser[]>();
  for (const u of crmUsers) {
    const key = phoneKey(u.phone);
    if (!key) continue;
    const list = crmByPhone.get(key) || [];
    list.push(u);
    crmByPhone.set(key, list);
  }

  for (const crmUser of crmUsers) {
    const key = phoneKey(crmUser.phone);
    const matchedProfiles = key ? profilesByPhone.get(key) || [] : [];
    const matchedCrmUsers = key ? crmByPhone.get(key) || [] : [];

    if (matchedProfiles.length > 1 || matchedCrmUsers.length > 1) {
      plan.skipped.push({ name: crmUser.name, reason: 'ambiguous_phone' });
      continue;
    }
    const profile = matchedProfiles[0] || null;

    if (profile && PROTECTED_ROLES.has(profile.role)) {
      plan.skipped.push({ name: crmUser.name, reason: 'protected_role' });
      continue;
    }
    if (profile && FIELD_WORK_ROLES.has(profile.role)) {
      plan.skipped.push({ name: crmUser.name, reason: 'field_work_role' });
      continue;
    }
    if (crmUser.role === 'field_worker') {
      plan.skipped.push({ name: crmUser.name, reason: 'field_worker' });
      continue;
    }
    if (OVERSIGHT_CRM_ROLES.has(crmUser.role)) {
      plan.skipped.push({ name: crmUser.name, reason: 'oversight_role' });
      continue;
    }

    const target = siteAuditTargetForCrmPermission(crmUser.role);

    const branch = crmUser.allowedBranches?.length === 1 ? crmUser.allowedBranches[0] : null;

    if (target === FIELD_WORKER_SKIP) {
      plan.skipped.push({ name: crmUser.name, reason: 'unmapped_permission' });
      continue;
    }
    if (target === null) {
      if (profile && profile.role) {
        plan.noLongerEntitled.push({ profileId: profile.id, name: profile.name, email: profile.email, currentRole: profile.role, crmPermission: crmUser.role });
      }
      continue;
    }

    if (!profile) {
      plan.noProfileYet.push({ crmUserId: crmUser.id, name: crmUser.name, phone: crmUser.phone, crmPermission: crmUser.role, targetRole: target, branch });
      continue;
    }
    if (profile.role === target) continue;

    plan.ready.push({ profileId: profile.id, name: profile.name, email: profile.email, crmPermission: crmUser.role, currentRole: profile.role, targetRole: target, branch });
  }

  return plan;
}

export function syntheticSiteAuditEmail(phone: string): string {
  return 'crm.' + phoneKey(phone) + '@site-audit.internal';
}

export function randomPasscode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

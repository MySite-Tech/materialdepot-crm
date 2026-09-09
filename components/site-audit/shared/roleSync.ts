import { phoneKey } from './identity';

/* CRM permission_name → Site Audit role, so access here is derived from the
   CRM rather than assigned twice by hand. Business-confirmed 2026-08. `null`
   means "no Site Audit access" — surfaced by the sync, never auto-applied:
   revoking is a human decision, granting isn't. `admin`/`tech` are absent on
   purpose, see OVERSIGHT_CRM_ROLES. */
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

/* `field_worker` covers auditors and installers with nothing to tell them
   apart, so it is absent above rather than null: null means "revoke", this
   means "hands off". An unknown permission_name is skipped the same way —
   never guess at a mapping. */
export const FIELD_WORKER_SKIP = 'skip' as const;

/* Oversight-rail roles, granted by the CRM session alone. They need no
   field-app profile, so the sync neither creates nor revokes one: a real role
   here would create a field-app `admin` for every CRM admin, and null would
   flag them "no longer entitled" while the CRM grants them the widest view. */
export const OVERSIGHT_CRM_ROLES = new Set(['admin', 'superadmin', 'tech']);

export function siteAuditTargetForCrmPermission(perm: string): string | null | typeof FIELD_WORKER_SKIP {
  if (perm === 'field_worker') return FIELD_WORKER_SKIP;
  if (OVERSIGHT_CRM_ROLES.has(perm)) return FIELD_WORKER_SKIP;
  if (perm in CRM_ROLE_TO_SITE_AUDIT_ROLE) return CRM_ROLE_TO_SITE_AUDIT_ROLE[perm];
  return FIELD_WORKER_SKIP;
}

/* Never touched by the sync, whatever the CRM permission computes to.
   `store_staff` has no CRM counterpart (it comes from the kiosk flow); `coe`
   and `content_team` are hand-assigned. Overwriting them would clobber a real
   assignment. */
const PROTECTED_ROLES = new Set(['store_staff', 'coe', 'content_team', 'service_mgr']);

/* `service_mgr` is in that set because nothing in a CRM permission can
   disprove it — SMs routinely carry `manager`/`sales` as a cost centre, which
   the sync read as licence to demote them to the branch rollup. Only the
   demotion is blocked; a matching CRM role is already a no-op. */

/* Roles that DO the field work. Their jobs are keyed to the profile (an
   auditor's queue is `audit_orders.auditor_email`), so flipping one to a desk
   role empties a real dashboard — and the CRM permission is no evidence they
   stopped: HR records the cost centre, not the job. Surfaced for a human. */
const FIELD_WORK_ROLES = new Set(['site_auditor', 'installer', 'auditor_installer']);

export type SiteAuditRoleSyncCrmUser = { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[]; active?: boolean };
export type SiteAuditRoleSyncProfile = { id: string; name: string; email: string; role: string; contact: string | null };

export type SiteAuditRoleSyncPlan = {
  ready: Array<{ profileId: string; name: string; email: string; crmPermission: string; currentRole: string; targetRole: string; branch: string | null }>;
  noProfileYet: Array<{ crmUserId: string | number; name: string; phone: string; crmPermission: string; targetRole: string; branch: string | null }>;
  skipped: Array<{ name: string; reason: 'field_worker' | 'protected_role' | 'field_work_role' | 'oversight_role' | 'ambiguous_phone' | 'unmapped_permission' }>;
  noLongerEntitled: Array<{ profileId: string; name: string; email: string; currentRole: string; crmPermission: string }>;
};

/* Pure — safe to preview before any write. Pairs CRM users to profiles by
   phoneKey() (the CRM has no email, only phone), applying the rules above in
   order: ambiguous match, protected role, field_worker, then the mapping.
   Nothing here writes; the caller applies the plan after a human reviews it. */
export function planSiteAuditRoleSync(
  allCrmUsers: SiteAuditRoleSyncCrmUser[],
  profiles: SiteAuditRoleSyncProfile[],
): SiteAuditRoleSyncPlan {
  const plan: SiteAuditRoleSyncPlan = { ready: [], noProfileYet: [], skipped: [], noLongerEntitled: [] };

  /* Deactivated employees drop out silently — listing them as "skipped" would
     bury the skips a human needs to see, and keeping them out of the phone
     maps stops a recycled number making their replacement unresolvable. */
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

    // Ambiguous either direction (0 or 2+ matches) — never guess.
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
    /* `profiles.branch` is one text column, and a stamped branch outranks the
       CRM list when a dashboard resolves scope — so stamping
       `allowedBranches[0]` for a two-branch person would NARROW them. null
       means "don't write the column", never "clear it". */
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
    // Real target role from here on.
    if (!profile) {
      plan.noProfileYet.push({ crmUserId: crmUser.id, name: crmUser.name, phone: crmUser.phone, crmPermission: crmUser.role, targetRole: target, branch });
      continue;
    }
    if (profile.role === target) continue; // already correct, nothing to do

    plan.ready.push({ profileId: profile.id, name: profile.name, email: profile.email, crmPermission: crmUser.role, currentRole: profile.role, targetRole: target, branch });
  }

  return plan;
}

/* Placeholder identity for a CRM user with no Site Audit profile yet. Never
   logged into: access is the CRM session, resolved by phone. It exists so
   profiles.email can stay the join key other code relies on (bm_email, Role
   Viewer), and is deterministic, so re-running the sync creates no duplicate. */
export function syntheticSiteAuditEmail(phone: string): string {
  return 'crm.' + phoneKey(phone) + '@site-audit.internal';
}

/* Random 4-digit passcode (this table's format). A sync-created profile is
   never meant to use material-depot-site's Login.html, so an uncommunicated
   passcode stops its "first login sets the PIN" flow claiming the account.
   upsertSiteAuditProfile sets `passcode: null` where a PIN *is* expected. */
export function randomPasscode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

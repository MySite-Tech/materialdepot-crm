export const ROLES: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: '#5b3aa6' },
  service_mgr: { label: 'Service Manager', color: '#1F3A5F' },
  site_auditor: { label: 'Site Auditor', color: '#2E6CA8' },
  installer: { label: 'Site Installer', color: '#1f7a3f' },
  auditor_installer: { label: 'Auditor + Installer', color: '#0f6e74' },
  store_staff: { label: 'Store Team', color: '#9a6200' },
  bm: { label: 'Business Manager', color: '#b45309' },
  coe: { label: 'Category Ops Executive', color: '#0369a1' },
  branch_mgr: { label: 'Branch Manager', color: '#be123c' },
};

/* The company-wide oversight rail as a real slug, not the absence of one. It
   used to be implied by permission_name being admin/tech, so the widest view
   in the product could not be withheld — 26 of the 30 accounts that reached it
   had never been granted `crm.site_audit`. Only a permission grants it now, so
   it can also be revoked. */
export const SITE_AUDIT_ADMIN_ROLE = 'admin';

/* Oversight has no field-app profile: it is a console over everyone else's
   work. Callers provisioning a `profiles` row from a granted sub-role must
   skip it, or every CRM admin becomes a field-app `admin` login. */
export function isSiteAuditOversightRole(role?: string | null): boolean {
  return role === SITE_AUDIT_ADMIN_ROLE;
}

// CRM individual_permissions slugs (Admin > Users) that grant a Site Audit
// sub-view, keyed to the same role values ROLES uses.
export const SITE_AUDIT_PERMISSION_TO_ROLE: Record<string, string> = {
  'site_audit.site_auditor': 'site_auditor',
  'site_audit.installer': 'installer',
  'site_audit.service_manager': 'service_mgr',
  'site_audit.auditor_installer': 'auditor_installer',
  'site_audit.bm': 'bm',
  'site_audit.coe': 'coe',
  'site_audit.branch_mgr': 'branch_mgr',
  'site_audit.admin': SITE_AUDIT_ADMIN_ROLE,
};

/* The same table read the other way. DERIVED, never hand-written: three
   hand-copied versions existed and one had already drifted, which is why an SM
   could not create an installer at all. Add a role to
   SITE_AUDIT_PERMISSION_TO_ROLE and both directions learn it at once. */
export const SITE_AUDIT_ROLE_TO_PERMISSION: Record<string, string> = Object.fromEntries(
  Object.entries(SITE_AUDIT_PERMISSION_TO_ROLE).map(([slug, role]) => [role, slug]),
);

/* What a new field-app person needs to sign in AND land somewhere:
   `crm.site_audit` grants the tab, the sub-permission picks the view. Without
   both they reach a CRM with no tabs. */
export const CRM_SITE_AUDIT_TAB_PERMISSION = 'crm.site_audit';
export function crmPermissionsForSiteAuditRole(role: string): string[] {
  const sub = SITE_AUDIT_ROLE_TO_PERMISSION[role];
  return sub ? [CRM_SITE_AUDIT_TAB_PERMISSION, sub] : [CRM_SITE_AUDIT_TAB_PERMISSION];
}

export function siteAuditRoleFromPermissions(perms: string[] | undefined | null): string | null {
  if (!Array.isArray(perms)) return null;
  for (const slug of perms) {
    const role = SITE_AUDIT_PERMISSION_TO_ROLE[slug];
    if (role) return role;
  }
  return null;
}

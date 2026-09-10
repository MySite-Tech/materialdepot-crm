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

export const SITE_AUDIT_ADMIN_ROLE = 'admin';

export function isSiteAuditOversightRole(role?: string | null): boolean {
  return role === SITE_AUDIT_ADMIN_ROLE;
}

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

export const SITE_AUDIT_ROLE_TO_PERMISSION: Record<string, string> = Object.fromEntries(
  Object.entries(SITE_AUDIT_PERMISSION_TO_ROLE).map(([slug, role]) => [role, slug]),
);

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

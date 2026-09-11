import { EXCLUDED_ROLES, roleFromPermission } from './roles';
import { mdFetch } from '../core/client';

function _mapUserOrg(u: Record<string, unknown>): import('../../../types/crm').AppUser {
  const user = u.user as Record<string, unknown> | null;
  const perm = u.user_permission_detail as Record<string, unknown> | null;
  const branches = (u.branch as Array<Record<string, unknown>>) || [];
  const fname = ((user?.f_name as string) || '').trim();
  const lname = ((user?.l_name as string) || '').trim();
  const role = roleFromPermission(perm);
  return {
    id: u.id as number,
    name: [fname, lname].filter(Boolean).join(' ') || String(user?.contact || ''),
    phone: String(user?.contact || ''),
    role,
    allowedBranches: branches.map((b) => b.branch_name as string).filter(Boolean),
    individualPermissions: Array.isArray(u.individual_permissions)
      ? (u.individual_permissions as string[])
      : [],
    active: u.status !== false,
  };
}

export async function fetchUsers(): Promise<import('../../../types/crm').AppUser[]> {
  const data = await mdFetch('/user-organisation/');
  return (data || []).map(_mapUserOrg).filter((u: import('../../../types/crm').AppUser) => !EXCLUDED_ROLES.has(u.role));
}

export async function addUser({ name, phone, role, individualPermissions }: { name: string; phone: string; role: string; individualPermissions?: string[] }): Promise<import('../../../types/crm').AppUser> {
  const data = await mdFetch('/user-organisation/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact: phone,
      name,
      role,
      ...(individualPermissions ? { individual_permissions: individualPermissions } : {}),
    }),
  });
  return _mapUserOrg(data);
}

export async function updateUser(id: string | number, updates: Partial<import('../../../types/crm').AppUser>): Promise<void> {
  const { individualPermissions, active, ...rest } = updates;
  await mdFetch(`/user-organisation/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...rest,
      ...(individualPermissions !== undefined ? { individual_permissions: individualPermissions } : {}),

      ...(active !== undefined ? { status: active } : {}),
    }),
  });
}

export async function deleteUser(id: string | number): Promise<void> {
  await mdFetch(`/user-organisation/${id}/`, { method: 'DELETE' });
}

export async function updateUserBranches(id: string | number, branches: string[]): Promise<void> {
  await mdFetch(`/user-organisation/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branches }),
  });
}


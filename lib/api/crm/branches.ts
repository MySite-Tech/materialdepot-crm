import { mdFetch } from '../core/client';
import { kylasFetch } from '../core/kylas-client';

export interface Branch { id: number; name: string; displayName: string }

export async function fetchBranches(): Promise<Branch[]> {
  const data = await kylasFetch("/fields/2215123");
  return (data.field?.picklist?.values || [])
    .filter((v: { deleted: boolean; disabled: boolean }) => !v.deleted && !v.disabled)
    .map((v: { id: number; name: string; displayName: string }) => ({
      id: v.id, name: v.name, displayName: v.displayName,
    }));
}

export async function fetchBranchList(): Promise<import('../../../types/crm').Branch[]> {
  const data = await mdFetch('/orgainsation-branch/');
  return (data?.results || data || []).map((b: { id: number; branch_name: string }) => ({ id: b.id, name: b.branch_name }));
}

export async function addBranch(name: string): Promise<import('../../../types/crm').Branch> {
  const data = await mdFetch('/orgainsation-branch/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_name: name }),
  });
  return { id: data.id, name: data.name || name };
}

export async function updateBranch(id: string | number, name: string): Promise<void> {
  await mdFetch(`/orgainsation-branch/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_name: name }),
  });
}

export async function deleteBranch(id: string | number): Promise<void> {
  await mdFetch(`/orgainsation-branch/${id}/`, { method: 'DELETE' });
}


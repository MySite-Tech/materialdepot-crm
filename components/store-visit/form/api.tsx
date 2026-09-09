'use client';

import { BranchOption } from '../types/store-visit';
import { assignBMToClient, fetchBMsByBranch, fetchBranches, lookupLeadByPhone } from '@/lib/mockApi';

export const mockApi = {
  fetchBranches: (): Promise<BranchOption[]> => fetchBranches(),

  lookupLeadByPhone: (phone: string, branch: string) => lookupLeadByPhone(phone, branch),
  fetchBMsByBranch: (branch: string) => fetchBMsByBranch(branch),
  assignBM: (clientContact: string, bmContact: string) =>
    assignBMToClient(clientContact, bmContact),
};

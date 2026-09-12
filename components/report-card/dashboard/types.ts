'use client';

import { AppUser } from '@/types/crm';

export interface Props {
  branches: string[];
  allowedBranches: string[];
  currentUser: AppUser;
}

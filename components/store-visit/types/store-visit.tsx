'use client';

import { Branch } from '@/lib/mockApi';

export type BranchOption = Branch;

export interface FormData {
  phoneNumber: string;
  name: string;
  userType: string | null;
  categories: string[];
  locality: string;
  projectType: null;
  propertyType: null;
  propertyName: string;
}

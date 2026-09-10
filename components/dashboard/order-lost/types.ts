'use client';

export interface Props {
  branches: string[];
  allowedBranches: string[];
}

export type Grp = 'Category' | 'Retail' | 'Other';

export type ReasonMap = Record<Grp, Record<string, number>>;

export interface BranchSummary {
  branch: string;
  totalCount: number; totalValue: number;
  activeCount: number; activeValue: number;
  wonCount: number; wonValue: number;
  lostCount: number; lostValue: number;
  groupCount: Record<Grp, number>;
  groupValue: Record<Grp, number>;
  reasonCount?: ReasonMap;
  reasonValue?: ReasonMap;
}

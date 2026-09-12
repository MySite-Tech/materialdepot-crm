'use client';

import { AppUser } from '@/types/crm';
import { RankingRow } from '@/lib/api';

export interface Props {
  branches: string[];
  allowedBranches: string[];
  currentUser: AppUser;
}

export interface TeamRankingMatch {
  matched: RankingRow[];
  ambiguous: number;
  unranked: number;
}

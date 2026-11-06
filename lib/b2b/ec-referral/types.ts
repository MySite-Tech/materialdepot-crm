import type { EcVisit } from '../ec-visits/types';

export type EcReferralView = 'mine' | 'store' | 'admin';

export interface ReferralSummary {
  id: string;
  company: string;
  contactPerson: string;
  phone: string;
  companyType: string;
  city: string;
  ec: string;
  at: string;
  status: string;
  bm: string;
  by: string;
  convertedAt: string;
}

export interface EcReferralData {
  referrals: ReferralSummary[];
  redirects: EcVisit[];
  ecs: string[] | null;
}

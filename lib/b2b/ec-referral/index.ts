import { b2bBackendGet, b2bBackendPost } from '../data/backend';
import type { EcReferralInput } from '@/components/b2b/models/outreach/intake';
import type { EcReferralData, EcReferralView, ReferralSummary } from './types';

export const fetchEcReferrals = (view: EcReferralView): Promise<EcReferralData> =>
  b2bBackendGet<EcReferralData>(`/ec-referral?view=${view}`);

export const sendEcReferral = (input: EcReferralInput): Promise<ReferralSummary> =>
  b2bBackendPost<ReferralSummary>('/ec-referral', input);

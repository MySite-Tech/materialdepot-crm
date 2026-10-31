import { b2bBackendGet, b2bBackendPost } from '../data/backend';
import type { EcReferralInput } from '@/components/b2b/models/outreach/intake';
import type { MyReferral } from './types';

export const fetchMyReferrals = (): Promise<MyReferral[]> => b2bBackendGet<MyReferral[]>('/ec-referral');

export const sendEcReferral = (input: EcReferralInput): Promise<MyReferral> =>
  b2bBackendPost<MyReferral>('/ec-referral', input);

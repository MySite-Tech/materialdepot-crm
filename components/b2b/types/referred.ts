import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';
import type { ReferralStage } from './kam';

export interface ReferredRow {
  key: string;
  name: string;
  phone: string;
  note?: string;
  referredOn: string;
  addedBy?: string;
  referrerId: string;
  referrer: string;
  onStudio: boolean;
  stage: ReferralStage;
  orders: number;
  enquiries: number;
  lastOrder?: string;
  open: OpenDeal[];
}

export interface ReferredState {
  status: 'pending' | 'ready' | 'failed';
  rows: ReferredRow[];
  error?: string;
  historyFailed: boolean;
}

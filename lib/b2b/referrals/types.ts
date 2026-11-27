export type ReferrerKind = 'inbound' | 'outreach' | 'client';

export interface CrmReferral {
  id: number;
  referrerKind: ReferrerKind;
  referrerId: string;
  referrerName?: string;
  clientName: string;
  clientPhone: string;
  note?: string;
  onStudio: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface StudioVisit {
  ec?: string;
  on: string;
  time: string;
  categories: string[];
  requirements?: string;
  notes?: string;
  status: string;
  visitedVia?: string;
  cancelReason?: string;
  bm?: string;
  bmPhone?: string;
  storeStatus?: string;
  storeNote?: string;
  bookedOn?: string;
}

export interface StudioOrder {
  enqId: string;
  value: number;
  on?: string;
  status?: string;
  approval?: string;
}

export interface StudioReferralDetail {
  phone: string;
  firmName: string;
  clientName: string;
  status: string;
  source: string;
  referredOn?: string;
  notes?: string;
  email?: string;
  city?: string;
  locality?: string;
  projectType?: string;
  budget?: string;
  timeline?: string;
  categories: string[];
  rejectionReason?: string;
  visits: StudioVisit[];
  orders: StudioOrder[];
}

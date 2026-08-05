export interface Remark {
  ts: string;
  author: string;
  text: string;
}

export interface CartItem {
  name: string;
  qty?: number;
  price?: number;
}

export interface Visit {
  date: string;
  channel: string;
  loggedBy?: string;
  cartSnapshot?: string | CartItem[];
}

export interface Lead {
  id: string;
  leadId?: string;
  ticketId?: number;
  createdAt: string;
  clientName?: string;
  clientPhone?: string;
  assignedTo: string;
  branch: string;
  status: string;
  lostReason?: string;
  cartValue?: number;
  cartItems?: string | CartItem[];
  followUpDate?: string;
  closureDate?: string;
  remarks?: Remark[];
  visits?: Visit[];
  clientType?: string;
  propertyType?: string;
  architectInvolved?: boolean;
  projectPhase?: string;
}

export interface AppUser {
  id: string | number;
  name: string;
  phone: string;
  role: string;
  allowedBranches?: string[];
  individualPermissions?: string[];
}

export interface Branch {
  id: number | string;
  name: string;
}


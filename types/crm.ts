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
  code: string;
  role: string;
  allowedBranches?: string[];
}

export interface Branch {
  id: number | string;
  name: string;
}

export interface ActivityLog {
  id: string | number;
  created_at: string;
  user_id?: string | number | null;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id?: string | number | null;
  details?: string;
}

export interface SupabaseRow {
  id: string;
  created_at: string;
  client_name: string;
  client_phone: string;
  assigned_to: string;
  branch: string;
  status: string;
  lost_reason: string;
  cart_value: number;
  cart_items: string[] | CartItem[];
  follow_up_date: string;
  closure_date: string;
  remarks: Remark[];
  visits: Visit[];
  first_visit_date: string;
  latest_visit_date: string;
  client_type: string;
  property_type: string;
  architect_involved: boolean;
  project_phase?: string;
}

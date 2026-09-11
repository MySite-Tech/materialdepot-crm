'use client';

import { AppUser, Branch, Lead, Remark, Visit } from '../../types/crm';

export type MainTab = 'leads' | 'dashboard' | 'footfall' | 'weeklyFunnel' | 'reportCard' | 'storeVisit' | 'sales' | 'b2bSales' | 'admin' | 'nps' | 'appointmentTracker' | 'siteAudit' | 'storeDisplay' | 'storeChecklist';

export interface AvatarProps {
  name?: string;
  size?: number;
}

export interface EditableStatusProps {
  status: string;
  lostReason?: string;
}

export interface ThProps {
  label: string;
  sortKey: string | null;
  sortCol: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  className?: string;
}

export interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
  className?: string;
  searchable?: boolean;
}

export interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  label?: string;
  className?: string;
}

type DrawerUser = { id: string | number; name: string };

export interface LeadDrawerProps {
  lead: Lead | null;
  currentUser: AppUser | null;
  branches: string[];
  users?: DrawerUser[];
  onSave: (lead: Lead) => void;
  onClose: () => void;
  onAddRemark?: (remark: Remark) => void;
  onImmediateSave?: (lead: Lead) => void;
  visitsLoading?: boolean;
}

export interface DateEditPopupProps {
  field: 'followUpDate' | 'closureDate';
  currentDate?: string;
  followUpDate?: string;
  closureDate?: string;
  assignedTo?: string;
  onSave: (newDate: string, remark: string) => void;
  onCancel: () => void;
}

export interface BranchManagerProps {
  branches: Branch[];
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
}

export interface LoginScreenProps {
  onLogin: (user: AppUser) => void;
}

export interface CsvRow {
  leadId: string;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  assignedTo: string;
  branch: string;
  status: string;
  lostReason: string;
  cartItems: string;
  cartValue: number;
  followUpDate: string;
  closureDate: string;
  remarks: Remark[];
  visits: Visit[];
  clientType: string;
  propertyType: string;
  architectInvolved: boolean;
  projectPhase: string;
  leadPriority?: 'hot' | 'warm' | 'cold';
}

export type DateEditState = { leadId: string; field: 'followUpDate' | 'closureDate' };

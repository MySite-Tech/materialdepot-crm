export type LeadStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Won"
  | "Lost";

export type TicketStatus =
  | "Open"
  | "In Progress"
  | "Pending"
  | "Resolved"
  | "Closed";

export type TicketPriority = "Low" | "Medium" | "High" | "Urgent";

export interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: LeadStatus;
  source: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  value: number;
}

export interface Ticket {
  id: number;
  subject: string;
  contactName: string;
  contactEmail: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
}

export interface DashboardStats {
  leads: {
    total: number;
    newToday: number;
    won: number;
    lost: number;
    conversionRate: number;
  };
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    avgResolutionHours: number;
  };
}

// ---------------------------------------------------------------------------
// Deals / Escalations
// ---------------------------------------------------------------------------

export interface Deal {
  id: number;
  name: string;
  ownedBy?: { id: number; name: string; email?: string } | null;
  estimatedValue?: { value: number; currencyId?: number } | null;
  estimatedClosureOn?: string | null;
  pipeline?: { id: number; name: string } | null;
  pipelineStage?: { id: number; name: string } | null;
  actualClosureDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  customFieldValues?: Record<string, unknown>;
}

export interface DealDetail extends Deal {
  associatedContacts?: { id: number; name: string }[];
  createdBy?: { id: number; name: string } | null;
  updatedAt?: string | null;
  forecastingType?: string | null;
  aging?: number | null;
  actualValue?: { value: number; currencyId?: number } | null;
}

export interface DealsSearchResponse {
  content: Deal[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ---------------------------------------------------------------------------
// Call Logs
// ---------------------------------------------------------------------------

export interface CallLogPerson {
  id: number;
  name: string;
  phoneNumber?: string | null;
}

export interface CallLog {
  id: number;
  outcome: string;
  callType: string;
  startTime: string;
  duration: number | null;
  phoneNumber: string;
  originator?: string | null;
  receiver?: string | null;
  isManual: boolean;
  callSummary?: string | null;
  owner?: CallLogPerson | null;
  createdBy?: CallLogPerson | null;
  relatedTo?: { id: number; entity: string; name: string }[];
  notesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CallLogsResponse {
  content: CallLog[];
  totalElements: number;
  totalPages: number;
  number: number;
}



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
  associatedContacts?: { id: number; name?: string }[];
}

export interface DealsSearchResponse {
  content: Deal[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

interface CallLogPerson {
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

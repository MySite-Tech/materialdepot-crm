export type Priority = 'P1' | 'P2' | 'P3';

export type Phase = 'civil' | 'carpentry' | 'decorative';

export type CohortKey =
  | 'cart_no_visit'
  | 'pending_quote'
  | 'pending_cart'
  | 'upsell_carpentry'
  | 'upsell_civil'
  | 'upsell_decorative'
  | 'visit_no_cart';

export interface CohortDef {
  key: CohortKey;
  label: string;
  group: string;
  priority: Priority;
  rule: string;
}

export type CallOutcome =
  | 'rnr'
  | 'busy'
  | 'switched_off'
  | 'invalid'
  | 'follow_up'
  | 'visit_booked'
  | 'call_back'
  | 'ordered'
  | 'bought_elsewhere'
  | 'not_interested';

export interface BankLead {
  key: string;
  cohort: CohortKey;
  phone: string;
  name: string;
  branch: string;
  bm: string;
  enteredOn: string;
  value: number;
  ref: string;
  detail: string;
}

export interface CallLog {
  id: string;
  key: string;
  at: string;
  by: string;
  byPhone: string;
  outcome: CallOutcome;
  note: string;
  followUpOn: string;
}

export interface Claim {
  by: string;
  byPhone: string;
  at: string;
}

export interface ImportDiag {
  cartFields: string[];
  visitFields: string[];
  statuses: Record<string, number>;
  branches: Record<string, number>;
}

export interface ImportRun {
  at: string;
  by: string;
  added: number;
  refreshed: number;
  samePerson: number;
  byCohort: Partial<Record<CohortKey, number>>;
  skippedActive: number;
  read: Record<string, number>;
  diag: ImportDiag | null;
}

export interface StoredLead extends BankLead {
  importedAt: string;
  claim: Claim | null;
}

export interface BankState {
  leads: StoredLead[];
  calls: CallLog[];
  imports: ImportRun[];
  plan: Record<string, Priority[]>;
}

export type BdaAccess = 'admin' | 'bda';

export type LeadStage = 'new' | 'attempting' | 'follow_up' | 'closed' | 'unreachable';

export interface LeadView extends BankLead {
  priority: Priority;
  month: string;
  claim: Claim | null;
  calls: CallLog[];
  stage: LeadStage;
  nextOn: string;
}

export interface AccessRow {
  name: string;
  logins: number;
}

export interface CohortResult {
  leads: BankLead[];
  skippedActive: number;
  read: Record<string, number>;
}

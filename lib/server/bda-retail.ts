import { b2bBackendFetch } from './b2b-backend';
import type { BankLead, BankState, CallLog, CallOutcome, Claim, CohortKey, ImportRun, Priority } from '../bda-retail/types';

export interface BatchResult {
  added: number;
  refreshed: number;
  samePerson: number;
}

export const readBank = (scope: { phone: string; cohorts: CohortKey[] } | null): Promise<BankState> =>
  b2bBackendFetch<BankState>(scope ? `/bda/bank?phone=${encodeURIComponent(scope.phone)}&cohorts=${scope.cohorts.join(',')}` : '/bda/bank');

export const importBatch = (leads: BankLead[]): Promise<BatchResult> =>
  b2bBackendFetch<BatchResult>('/bda/import/leads', { method: 'POST', body: { leads } });

export const recordImport = async (run: Omit<ImportRun, 'at'>): Promise<ImportRun> =>
  (await b2bBackendFetch<{ run: ImportRun }>('/bda/import/run', { method: 'POST', body: run })).run;

export const claimLead = async (key: string, by: string, phone: string): Promise<Claim> =>
  (await b2bBackendFetch<{ claim: Claim }>('/bda/claim', { method: 'POST', body: { key, by, phone } })).claim;

export const assignLeads = async (assignments: Array<{ key: string; by: string; phone: string }>): Promise<number> =>
  (await b2bBackendFetch<{ assigned: number }>('/bda/assign', { method: 'POST', body: { assignments } })).assigned;

export const releaseLead = async (key: string): Promise<void> => {
  await b2bBackendFetch('/bda/release', { method: 'POST', body: { key } });
};

export const logCall = async (call: { key: string; by: string; phone: string; outcome: CallOutcome; note: string; followUpOn: string }): Promise<CallLog> =>
  (await b2bBackendFetch<{ call: CallLog }>('/bda/call', { method: 'POST', body: call })).call;

export const setPlan = async (month: string, priorities: Priority[] | null, by: string): Promise<void> => {
  await b2bBackendFetch('/bda/plan', { method: 'PUT', body: { month, priorities, by } });
};

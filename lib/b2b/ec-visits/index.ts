import { b2bBackendGet, b2bBackendPut } from '../data/backend';
import { ecVisitQueryString, ecVisitToRow, rowToEcVisit } from './utils';
import type { EcVisit, EcVisitQuery, EcVisitRow } from './types';

export type { EcAssisted, EcTicket, EcVisit, EcVisitKind, EcVisitQuery, EcVisitStatus } from './types';
export { EC_VISIT_STATUSES } from './constants';

export const fetchEcVisits = (q: EcVisitQuery): Promise<EcVisit[]> =>
  b2bBackendGet<{ visits: EcVisitRow[] }>(`/ec-visits${ecVisitQueryString(q)}`).then((b) => b.visits.map(rowToEcVisit));

export const fetchClientRedirects = (leadRef: string, phones: string[]): Promise<EcVisit[]> =>
  fetchEcVisits({ kind: 'redirect', leadRef, phones });

export const saveEcVisit = (v: EcVisit): Promise<EcVisit> =>
  b2bBackendPut<EcVisitRow>('/ec-visits', ecVisitToRow(v)).then(rowToEcVisit);

export { checkAssisted, fetchEcTickets } from './assisted';

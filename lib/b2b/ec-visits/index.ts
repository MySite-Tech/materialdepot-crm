import { b2bBackendGet, b2bBackendPut } from '../data/backend';
import { ecVisitQueryString, ecVisitToRow, rowToEcVisit } from './utils';
import type { EcVisit, EcVisitQuery, EcVisitRow } from './types';

export type { EcVisit, EcVisitQuery, EcVisitStatus } from './types';
export { EC_VISIT_STATUSES } from './constants';

export const fetchEcVisits = (q: EcVisitQuery): Promise<EcVisit[]> =>
  b2bBackendGet<{ visits: EcVisitRow[] }>(`/ec-visits${ecVisitQueryString(q)}`).then((b) => b.visits.map(rowToEcVisit));

export const saveEcVisit = (v: EcVisit): Promise<EcVisit> =>
  b2bBackendPut<EcVisitRow>('/ec-visits', ecVisitToRow(v)).then(rowToEcVisit);

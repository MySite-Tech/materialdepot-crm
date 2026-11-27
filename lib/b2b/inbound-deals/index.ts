import { b2bBackendPost } from '../data/backend';
import type { OpenDealsReport } from './types';

export const fetchInboundOpenDeals = (phones: string[], fresh = false): Promise<OpenDealsReport> =>
  b2bBackendPost<OpenDealsReport>('/inbound/deals', { phones, fresh });

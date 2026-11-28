import { b2bBackendPost } from '../data/backend';
import type { TicketSkus } from './types';

export const fetchTicketSkus = (enqId: string, phone: string): Promise<TicketSkus> =>
  b2bBackendPost<TicketSkus>('/ticket-skus', { enqId, phone });

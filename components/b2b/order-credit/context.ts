'use client';

import { createContext } from 'react';
import type { CreditInput, OrderCredit } from '@/lib/b2b/revenue';
import type { B2BTeam } from '@/lib/b2b/team/types';

export interface CreditPerson {
  name: string;
  phone: string;
  team: B2BTeam;
}

export type CreditsState = 'idle' | 'loading' | 'ready' | 'failed';

export interface OrderCreditsApi {
  credits: Map<string, OrderCredit> | null;
  state: CreditsState;
  error: string | null;
  load: () => void;
  canEdit: boolean;
  people: CreditPerson[];
  save: (input: CreditInput) => Promise<void>;
  clear: (enquiryId: string) => Promise<void>;
}

const unavailable = () => Promise.reject(new Error('Order credits are not available here'));

export const OrderCreditsContext = createContext<OrderCreditsApi>({
  credits: null,
  state: 'idle',
  error: null,
  load: () => undefined,
  canEdit: false,
  people: [],
  save: unavailable,
  clear: unavailable,
});

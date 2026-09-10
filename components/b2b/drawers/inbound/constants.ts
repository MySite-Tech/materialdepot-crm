'use client';

import { CallAttemptOutcome } from '../../models/inbound';

export const KYLAS_OUTCOME: Record<CallAttemptOutcome, 'connected' | 'no_answer'> = {
  Connected: 'connected',
  RNR: 'no_answer',
};

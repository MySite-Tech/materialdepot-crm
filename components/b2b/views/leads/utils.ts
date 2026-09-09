'use client';

import { UnifiedLead } from '@/lib/b2b';

export const toExportRow = (l: UnifiedLead): (string | number)[] => [
  l.companyName || '',
  l.gstNumber || '',
  l.phone || '',
  l.enqId || '',
  l.orderValue || '',

  l.hasExpectedClosureField ? (l.expectedClosure || '') : 'n/a (inbound)',
  l.kam || '',
  l.source,
  l.spok || '',
  l.status,
  l.lost ? 'Lost' : '',
  l.sourceStatus,
];

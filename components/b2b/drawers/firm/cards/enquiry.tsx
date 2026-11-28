'use client';

import { OrderCreditLine } from '../../../order-credit/ui/credit-line';
import { DealInline } from '../../../ui/deal-detail';
import { ClientOrderRow } from '@/lib/b2b';

export function EnquiryDetail({ r, actions, creditRule }: { r: ClientOrderRow; actions?: React.ReactNode; creditRule?: string }) {
  return (
    <DealInline
      enqId={r.enqId}
      fallback={r}
      actions={(actions || (r.ordered && r.enqId)) ? (
        <>
          {actions}
          {r.ordered && !!r.enqId && <OrderCreditLine enquiryId={r.enqId} rule={creditRule} />}
        </>
      ) : undefined}
    />
  );
}

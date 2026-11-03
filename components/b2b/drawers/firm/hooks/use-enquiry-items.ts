'use client';

import { BoqLine, ClientOrderRow, fetchEnquiryItems } from '@/lib/b2b';
import { useEffect, useState } from 'react';

export function useEnquiryItems(r: ClientOrderRow) {
  const needed = !r.items && /^ENQ/i.test(r.enqId);
  const [items, setItems] = useState<BoqLine[] | undefined>(r.items);
  const [state, setState] = useState<'ready' | 'loading' | 'failed'>(needed ? 'loading' : 'ready');

  useEffect(() => {
    if (!needed) return;
    let alive = true;
    fetchEnquiryItems(r.enqId)
      .then((lines) => { if (alive) { setItems(lines); setState('ready'); } })
      .catch((e) => { console.error('[b2b] enquiry items failed', e); if (alive) setState('failed'); });
    return () => { alive = false; };
  }, [needed, r.enqId]);

  return { items: r.items ?? items, state };
}

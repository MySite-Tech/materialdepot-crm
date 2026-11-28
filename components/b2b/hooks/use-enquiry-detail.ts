'use client';

import { useEffect, useState } from 'react';
import { fetchEnquiryDetail, type ClientOrderRow } from '@/lib/b2b';

export type EnquiryDetailState =
  | { status: 'loading' }
  | { status: 'ready'; row: ClientOrderRow }
  | { status: 'missing' }
  | { status: 'failed'; error: string };

export function useEnquiryDetail(enqId: string | null) {
  const [state, setState] = useState<EnquiryDetailState>({ status: 'loading' });
  useEffect(() => {
    if (!enqId) return;
    let alive = true;
    setState({ status: 'loading' });
    fetchEnquiryDetail(enqId)
      .then((row) => { if (alive) setState(row ? { status: 'ready', row } : { status: 'missing' }); })
      .catch((e) => { if (alive) setState({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [enqId]);
  return state;
}

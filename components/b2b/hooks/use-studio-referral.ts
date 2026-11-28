'use client';

import { useEffect, useState } from 'react';
import { fetchStudioReferrals, type StudioReferralDetail } from '@/lib/b2b/studio-referrals';

export type StudioReferralState =
  | { status: 'loading' }
  | { status: 'ready'; details: StudioReferralDetail[] }
  | { status: 'failed'; error: string };

export function useStudioReferral(phone: string) {
  const [state, setState] = useState<StudioReferralState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetchStudioReferrals([phone])
      .then((details) => { if (alive) setState({ status: 'ready', details }); })
      .catch((e) => { if (alive) setState({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [phone]);
  return state;
}

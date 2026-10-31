'use client';

import { fetchStudioSignInUrl } from '@/lib/b2b/studio-handoff';
import { useCallback, useEffect, useState } from 'react';

export function useStudioSignIn(fallbackUrl: string) {
  const [state, setState] = useState<{ src: string | null; error: string }>({ src: null, error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ src: null, error: '' });
    fetchStudioSignInUrl()
      .then((src) => live && setState({ src, error: '' }))
      .catch((e) => live && setState({ src: fallbackUrl, error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, [attempt, fallbackUrl]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { src: state.src, error: state.error, reload };
}

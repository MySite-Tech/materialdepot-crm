'use client';

import { StudioLogins } from '../models/client';
import { fetchStudioLogins } from '@/lib/b2b/studio-logins';
import { useEffect, useState } from 'react';

export function useStudioLogins() {
  const [state, setState] = useState<{ logins: StudioLogins | null; error: string }>({ logins: null, error: '' });

  useEffect(() => {
    let live = true;
    fetchStudioLogins()
      .then((logins) => live && setState({ logins, error: '' }))
      .catch((e) => live && setState({ logins: null, error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, []);

  return { logins: state.logins, error: state.error, loading: !state.logins && !state.error };
}

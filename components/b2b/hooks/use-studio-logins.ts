'use client';

import { StudioFirm, StudioLogins } from '../models/client';
import { fetchStudioAccess } from '@/lib/b2b/studio-logins';
import { useCallback, useEffect, useState } from 'react';

export function useStudioLogins() {
  const [state, setState] = useState<{ logins: StudioLogins | null; firms: StudioFirm[]; error: string }>({ logins: null, firms: [], error: '' });

  const read = useCallback(() => {
    let live = true;
    fetchStudioAccess()
      .then(({ logins, firms }) => live && setState({ logins, firms, error: '' }))
      .catch((e) => live && setState({ logins: null, firms: [], error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, []);

  useEffect(() => read(), [read]);

  return { logins: state.logins, firms: state.firms, error: state.error, loading: !state.logins && !state.error, reload: read };
}

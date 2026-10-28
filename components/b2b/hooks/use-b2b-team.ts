import { useCallback, useEffect, useState } from 'react';
import { fetchTeam } from '@/lib/b2b/team';
import type { B2BTeamLoad, TeamState } from '@/lib/b2b/team/types';

export function useB2BTeam(): B2BTeamLoad {
  const [state, setState] = useState<TeamState>({ members: [], tableMissing: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetchTeam()
      .then((s) => { setState(s); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the B2B team'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { ...state, loading, error, reload };
}

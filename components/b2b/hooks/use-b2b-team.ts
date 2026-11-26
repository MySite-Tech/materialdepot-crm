import { useCallback, useEffect, useState } from 'react';
import { fetchTeam } from '@/lib/b2b/team';
import type { B2BTeamLoad, TeamMember, TeamState } from '@/lib/b2b/team/types';

export function useB2BTeam(): B2BTeamLoad {
  const [state, setState] = useState<TeamState>({ members: [], tableMissing: false, coverReady: false, pauseReady: false });
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

  const patch = useCallback((m: TeamMember) => setState((s) => {
    const at = s.members.findIndex((x) => x.phone === m.phone && x.team === m.team);
    return { ...s, members: at < 0 ? [...s.members, m] : s.members.map((x, i) => (i === at ? m : x)) };
  }), []);

  return { ...state, loading, error, reload, patch };
}

'use client';

import { OrgTeam, buildTeam } from '@/lib/org';
import { fetchUsers } from '@/lib/api';
import { useEffect, useState } from 'react';

export interface TeamState {
  team: OrgTeam | null;
  loading: boolean;
  failed: boolean;
}

export function useTeam({ id, name, phone, role, branchKey }: {
  id: string | number;
  name: string;
  phone: string;
  role: string;
  branchKey: string;
}): TeamState {
  const [team, setTeam] = useState<OrgTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const viewer = { id, name, phone, role, allowedBranches: branchKey ? branchKey.split(',') : [] };
    setLoading(true);
    fetchUsers()
      .then((roster) => {
        if (!live) return;
        setTeam(buildTeam(roster, viewer));
        setFailed(false);
      })
      .catch(() => {
        if (!live) return;
        setTeam(null);
        setFailed(true);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, name, phone, role, branchKey]);

  return { team, loading, failed };
}

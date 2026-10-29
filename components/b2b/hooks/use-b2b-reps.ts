'use client';

import { B2B_ROSTER } from '../models/mock-data';
import { Rep } from '../models/outreach/intake';
import type { B2BTeam, B2BTeamLoad } from '@/lib/b2b/team/types';
import { useMemo } from 'react';

const rosterReps = (role: 'Outbound' | 'KAM'): Rep[] =>
  B2B_ROSTER.filter((r) => r.role === role).map((r) => ({ name: r.name, phone: r.contact }));

export function useB2BReps(team: B2BTeamLoad): { live: boolean; reps: Rep[]; kams: Rep[] } {
  return useMemo(() => {
    const live = !team.tableMissing && !team.error;
    const members = (t: B2BTeam, rotationOnly = false): Rep[] => team.members
      .filter((m) => m.team === t && m.active && (!rotationOnly || m.inRotation))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ name: m.name, phone: m.phone }));
    const liveReps = members('outreach');
    const liveKams = members('kam', true);
    return {
      live,
      reps: live && liveReps.length ? liveReps : rosterReps('Outbound'),
      kams: live && liveKams.length ? liveKams : rosterReps('KAM'),
    };
  }, [team.members, team.tableMissing, team.error]);
}

'use client';

import { B2B_ROSTER } from '../models/mock-data';
import { Rep } from '../models/outreach/intake';
import type { B2BTeam, B2BTeamLoad } from '@/lib/b2b/team/types';
import { useMemo } from 'react';

const rosterReps = (role: 'Outbound' | 'KAM'): Rep[] =>
  B2B_ROSTER.filter((r) => r.role === role).map((r) => ({ name: r.name, phone: r.contact }));

export function useB2BReps(team: B2BTeamLoad): { live: boolean; reps: Rep[]; rotationReps: Rep[]; kams: Rep[]; allKams: Rep[]; everyone: Rep[] } {
  return useMemo(() => {
    const live = !team.tableMissing && !team.error;
    const members = (t: B2BTeam, rotationOnly = false): Rep[] => team.members
      .filter((m) => m.team === t && m.active && (!rotationOnly || m.inRotation))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ name: m.name, phone: m.phone }));
    const liveReps = members('outreach');
    const liveRotation = members('outreach', true);
    const liveKams = members('kam', true);
    const liveAllKams = members('kam');
    const liveEveryone = [...new Map(team.members.filter((m) => m.active).map((m) => [m.phone, { name: m.name, phone: m.phone }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      live,
      reps: live && liveReps.length ? liveReps : rosterReps('Outbound'),
      rotationReps: live && liveRotation.length ? liveRotation : rosterReps('Outbound'),
      kams: live && liveKams.length ? liveKams : rosterReps('KAM'),
      allKams: live && liveAllKams.length ? liveAllKams : rosterReps('KAM'),
      everyone: live && liveEveryone.length ? liveEveryone : B2B_ROSTER.map((r) => ({ name: r.name, phone: r.contact })),
    };
  }, [team.members, team.tableMissing, team.error]);
}

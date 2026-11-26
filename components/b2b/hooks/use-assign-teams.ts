'use client';

import { Rep } from '../models/outreach/intake';
import { AssignTeams } from '../ui/assign-bar';
import { useB2BReps } from './use-b2b-reps';
import type { B2BTeamLoad, TeamMember } from '@/lib/b2b/team/types';
import { onDutyIn, teamMembers } from '@/lib/b2b/team/utils';
import { useMemo } from 'react';

export function useAssignTeams(team: B2BTeamLoad): { teams: Required<AssignTeams>; inboundTeam: TeamMember[] } {
  const { reps, rotationReps, kams, allKams } = useB2BReps(team);
  const inboundTeam = useMemo(() => teamMembers(onDutyIn(team.members, 'inbound'), 'inbound'), [team.members]);
  const teams = useMemo(() => {
    const rep = (m: { name: string; phone: string }): Rep => ({ name: m.name, phone: m.phone });
    return {
      inbound: { reps: inboundTeam.map(rep), rotation: inboundTeam.filter((m) => m.inRotation).map(rep) },
      outreach: { reps, rotation: rotationReps },
      kam: { reps: allKams, rotation: kams },
    };
  }, [inboundTeam, reps, rotationReps, allKams, kams]);
  return { teams, inboundTeam };
}

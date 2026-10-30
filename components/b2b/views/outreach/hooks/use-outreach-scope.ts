'use client';

import { OutreachLead } from '../../../models/mock-data';
import { isHandoverKam, sameRep } from '../../../models/outreach/handover';
import { Rep } from '../../../models/outreach/intake';
import { useB2BReps } from '../../../hooks/use-b2b-reps';
import { OutreachScope } from '../types';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { membershipIn } from '@/lib/b2b/team/utils';
import { normalisePhone } from '@/lib/org/utils';
import { useMemo } from 'react';

export function useOutreachScope(team: B2BTeamLoad, viewer: Viewer): OutreachScope {
  const { live, reps, rotationReps, kams } = useB2BReps(team);
  return useMemo(() => {
    const me: Rep = { name: viewer.member?.name || viewer.name, phone: viewer.phone };
    const onOutreach = !!membershipIn(viewer, 'outreach');
    const onKam = !!membershipIn(viewer, 'kam');
    const isKam = onKam && !onOutreach;

    const mine = (l: OutreachLead) => {
      if (onKam && isHandoverKam(l, { name: me.name, phone: me.phone || '' })) return true;
      if (isKam) return false;
      const bmPhone = normalisePhone(l.bmPhone);
      return bmPhone.length === 10 && me.phone ? bmPhone === me.phone : sameRep(l.bm, me.name);
    };

    if (!live) {
      const why = team.tableMissing ? 'The B2B team list is not set up yet' : `The B2B team list did not load (${team.error})`;
      return viewer.isManager
        ? { mode: 'open', me, isManager: true, isKam, reps, rotationReps, kams, owns: () => true, notice: `${why}, so the BM pickers in forms use the old roster.` }
        : { mode: 'mine', me, isManager: false, isKam, reps, rotationReps, kams, owns: mine, notice: `${why}, so only leads with you as BM are shown.` };
    }
    if (viewer.isManager) return { mode: 'team', me, isManager: true, isKam, reps, rotationReps, kams, owns: () => true, notice: null };
    return {
      mode: 'mine', me, isManager: false, isKam, reps, rotationReps, kams, owns: mine,
      notice: onOutreach || onKam
        ? null
        : 'You are not on the Outreach team list, so only leads with you as BM are shown. An admin can add you under B2B → Team.',
    };
  }, [live, reps, rotationReps, kams, team.tableMissing, team.error, viewer]);
}

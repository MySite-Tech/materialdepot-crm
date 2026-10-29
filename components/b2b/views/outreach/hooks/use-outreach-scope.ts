'use client';

import { OutreachLead } from '../../../models/mock-data';
import { isHandoverKam, sameRep } from '../../../models/outreach/handover';
import { Rep } from '../../../models/outreach/intake';
import { useB2BReps } from '../../../hooks/use-b2b-reps';
import { OutreachScope } from '../types';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { normalisePhone } from '@/lib/org/utils';
import { useMemo } from 'react';

export function useOutreachScope(team: B2BTeamLoad, viewer: Viewer): OutreachScope {
  const { live, reps, kams } = useB2BReps(team);
  return useMemo(() => {
    const me: Rep = { name: viewer.member?.name || viewer.name, phone: viewer.phone };
    const isKam = viewer.member?.team === 'kam';

    const mine = (l: OutreachLead) => {
      if (isKam) return isHandoverKam(l, { name: me.name, phone: me.phone || '' });
      const bmPhone = normalisePhone(l.bmPhone);
      return bmPhone.length === 10 && me.phone ? bmPhone === me.phone : sameRep(l.bm, me.name);
    };

    if (!live) {
      return {
        mode: 'open', me, isManager: viewer.isManager, isKam, reps, kams, owns: () => true,
        notice: team.tableMissing
          ? 'The B2B team list is not set up yet, so every BM\'s leads are shown and the BM pickers in forms use the old roster.'
          : `The B2B team list did not load (${team.error}), so every BM's leads are shown.`,
      };
    }
    if (viewer.isManager) return { mode: 'team', me, isManager: true, isKam, reps, kams, owns: () => true, notice: null };
    return {
      mode: 'mine', me, isManager: false, isKam, reps, kams, owns: mine,
      notice: viewer.member?.team === 'outreach' || isKam
        ? null
        : 'You are not on the Outreach team list, so only leads with you as BM are shown. An admin can add you under B2B → Team.',
    };
  }, [live, reps, kams, team.tableMissing, team.error, viewer.name, viewer.phone, viewer.isManager, viewer.member]);
}

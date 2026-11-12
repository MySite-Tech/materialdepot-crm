'use client';

import { useEffect, useMemo, useState } from 'react';
import InboundDrawer from '../../../drawers/inbound/index';
import OutreachDrawer from '../../../drawers/outreach/index';
import { useB2BReps } from '../../../hooks/use-b2b-reps';
import { InboundLead, OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { waitlistFor, waitlistIndex } from '../../../models/outreach/kpis';
import { withJourney } from '../../../models/outreach/reminders';
import { useOutreachScope } from '../../outreach/hooks/use-outreach-scope';
import { SaveLead } from '../../outreach/types';
import { nowIso } from '../../outreach/utils';
import { KamRecord } from './kam-record';
import { upsertOutreachLead } from '@/lib/b2b';
import type { B2BData } from '@/lib/b2b';
import { fetchStudioWaitlist } from '@/lib/b2b/outreach';
import { membershipIn, teamMembers } from '@/lib/b2b/team/utils';
import type { B2BTeam, B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';

export interface OpenRecord { team: B2BTeam; id: string }

function InboundRecord({ lead, team, viewer, onClose }: { lead: InboundLead; team: B2BTeamLoad; viewer: Viewer; onClose: () => void }) {
  const { everyone } = useB2BReps(team);
  const [current, setCurrent] = useState(lead);
  return (
    <InboundDrawer
      lead={current}
      onClose={onClose}
      actorName={viewer.name}
      actorPhone={viewer.phone}
      members={teamMembers(team.members, 'inbound')}
      people={everyone}
      canReassign={viewer.isManager || !!membershipIn(viewer, 'inbound')}
      onSaved={setCurrent}
    />
  );
}

function OutreachRecord({ lead, team, viewer, onClose }: { lead: OutreachLead; team: B2BTeamLoad; viewer: Viewer; onClose: () => void }) {
  const scope = useOutreachScope(team, viewer);
  const [current, setCurrent] = useState(lead);
  const [waitlist, setWaitlist] = useState<WaitlistSignup[] | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  useEffect(() => {
    fetchStudioWaitlist()
      .then(setWaitlist)
      .catch((e) => setWaitlistError(e instanceof Error ? e.message : 'Studio Space did not answer'));
  }, []);
  const waitIdx = useMemo(() => waitlistIndex(waitlist), [waitlist]);
  const by = scope.me.name || 'Unknown user';
  const save: SaveLead = async (before, after) => {
    const next = withJourney(before, { ...after, value: Number(after.orderValue) || 0 }, by, nowIso());
    const err = await upsertOutreachLead(next);
    if (!err) setCurrent(next);
    return err;
  };
  return <OutreachDrawer lead={current} scope={scope} waitlist={waitlistFor(current, waitIdx)} waitlistError={waitlistError} onClose={onClose} onSave={save} />;
}

export function ReminderRecord({ open, data, team, viewer, onClose }: {
  open: OpenRecord;
  data: B2BData;
  team: B2BTeamLoad;
  viewer: Viewer;
  onClose: () => void;
}) {
  const [inbound] = useState(() => data.inbound.find((l) => l.id === open.id));
  const [outreach] = useState(() => data.outreach.find((l) => l.id === open.id));
  if (open.team === 'inbound' && inbound) return <InboundRecord lead={inbound} team={team} viewer={viewer} onClose={onClose} />;
  if (open.team === 'outreach' && outreach) return <OutreachRecord lead={outreach} team={team} viewer={viewer} onClose={onClose} />;
  if (open.team === 'kam') return <KamRecord clientId={open.id} data={data} team={team} viewer={viewer} onClose={onClose} />;
  return null;
}

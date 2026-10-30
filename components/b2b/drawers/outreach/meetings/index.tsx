'use client';

import { useState } from 'react';
import { MEETING_STATUS_COLORS } from '../../../models/outreach';
import { meetingGaps } from '../../../models/outreach/reminders';
import { OutreachLead, OutreachMeeting } from '../../../models/mock-data';
import { MeetingEditor } from './editor';
import { MeetingEntry } from './entry';
import { gapLabel, meetingsNewestFirst, startsExpanded } from './utils';

export function MeetingTimeline({ meetings, draft, set, patchMeeting, showGates, lastHeld, openLead, scheduledNext, followUpError, contactList }: {
  meetings: OutreachMeeting[];
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  patchMeeting: (n: number, patch: Partial<OutreachMeeting>) => void;
  showGates: boolean;
  lastHeld: number | undefined;
  openLead: boolean;
  scheduledNext: boolean;
  followUpError: boolean;
  contactList: string;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(meetings.filter(startsExpanded).map((m) => m.n)));
  const toggle = (n: number, on: boolean) => setExpanded((prev) => {
    const next = new Set(prev);
    if (on) next.add(n); else next.delete(n);
    return next;
  });

  const patch = (n: number, p: Partial<OutreachMeeting>) => { toggle(n, true); patchMeeting(n, p); };

  const ordered = meetingsNewestFirst(meetings);
  const chronological = [...ordered].reverse();
  return (
    <ol className="relative">
      {ordered.map((m, i) => {
        const isLastHeld = m.n === lastHeld && openLead;
        const forced = m.status === 'Scheduled' || (showGates && meetingGaps(m).length > 0) || (isLastHeld && followUpError);
        const open = forced || expanded.has(m.n);
        const prev = chronological[chronological.indexOf(m) - 1];
        return (
          <li key={m.n} className="relative pl-6 pb-3 last:pb-0">
            {i < ordered.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200" aria-hidden />}
            <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-white" style={{ background: MEETING_STATUS_COLORS[m.status] }} aria-hidden />
            <div className={open ? 'rounded-md border border-gray-200 p-3 bg-white' : 'pt-0.5'}>
              {open ? (
                <MeetingEditor
                  m={m}
                  draft={draft}
                  set={set}
                  patchMeeting={patch}
                  showGates={showGates}
                  isLastHeld={isLastHeld}
                  scheduledNext={scheduledNext}
                  followUpError={followUpError}
                  contactList={contactList}
                  onDone={forced ? undefined : () => toggle(m.n, false)}
                />
              ) : (
                <MeetingEntry m={m} gap={gapLabel(m, prev)} followUp={isLastHeld ? draft.followUpDate : undefined} onEdit={() => toggle(m.n, true)} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

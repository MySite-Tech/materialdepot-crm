'use client';

import { OutreachLead, OutreachMeeting } from '../../../models/mock-data';
import { completedMeetings, nextMeetingNumber } from '../../../models/outreach';
import { nextMeetingBlocker } from '../../../models/outreach/reminders';
import { Empty, Field, SectionCard, errorInputCls } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';
import { Dispatch, SetStateAction } from 'react';
import { MeetingTimeline } from '../meetings';

export function OutreachCompanyCard({ draft, set, showGates, exhausted, locked, stored, onCheckIn, mArea, mDate, mError, mOffice, mTime, meetings, patchMeeting, scheduleMeeting, scheduling, setMArea, setMDate, setMError, setMOffice, setMTime, setScheduling }: {
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  showGates: boolean;
  exhausted: boolean;
  locked: Set<number>;
  stored: Set<number>;
  onCheckIn: (n: number) => void;
  mArea: string;
  mDate: string;
  mError: string | null;
  mOffice: string;
  mTime: string;
  meetings: OutreachMeeting[];
  patchMeeting: (n: number, patch: Partial<OutreachMeeting>) => void;
  scheduleMeeting: () => void;
  scheduling: boolean;
  setMArea: Dispatch<SetStateAction<string>>;
  setMDate: Dispatch<SetStateAction<string>>;
  setMError: Dispatch<SetStateAction<string | null>>;
  setMOffice: Dispatch<SetStateAction<string>>;
  setMTime: Dispatch<SetStateAction<string>>;
  setScheduling: Dispatch<SetStateAction<boolean>>;
}) {
  const held = completedMeetings(meetings);
  const lastHeld = held.length ? held[held.length - 1].n : undefined;
  const openLead = draft.status !== 'Closed' && draft.status !== 'Lost';
  const scheduledNext = meetings.some((m) => m.status === 'Scheduled');
  const followUpError = showGates && !scheduledNext && !draft.followUpDate;
  const people = [
    draft.contactPerson ? `${draft.contactPerson}${draft.designation ? ` (${draft.designation})` : ''}` : '',
    ...(draft.contacts || []).filter((c) => c.name.trim()).map((c) => `${c.name.trim()}${c.role ? ` (${c.role})` : ''}`),
  ].filter(Boolean);
  const contactList = `outreach-met-${draft.id}`;
  const blocker = nextMeetingBlocker(meetings);
  return (
    <SectionCard
      title={`Meetings · ${meetings.length}`}
      owner="crm"
      subtitle="Newest first. Past meetings read as notes; Edit opens one"
      right={blocker
        ? <span className="text-[11px] text-gray-400 max-w-[260px] text-right leading-snug">{blocker}</span>
        : (
          <button
            onClick={() => setScheduling((v) => !v)}
            className="px-3 py-1 text-[11px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap"
          >
            + Schedule meeting {nextMeetingNumber(meetings)}
          </button>
        )}
    >
      {exhausted && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 leading-snug">
          {meetings.length} meetings were postponed and none was held. Book another, mark the lead
          {' '}<strong>Lost</strong> with reason &ldquo;Unable to meet (4 meetings)&rdquo;, or park it on
          {' '}<strong>Follow up</strong> with a long-term date. Nothing is decided for you.
        </div>
      )}
    
      {scheduling && (
        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50/70 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Meeting date" required>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={mError && !mDate ? errorInputCls : inputCls} />
            </Field>
            <Field label="Time">
              <input type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Area" hint="e.g. Indiranagar">
              <input value={mArea} onChange={(e) => setMArea(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Office location">
              <input value={mOffice} onChange={(e) => setMOffice(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {mError && <p className="text-[11px] text-red-600 mt-2">{mError}</p>}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={() => { setScheduling(false); setMError(null); }} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
            <button onClick={scheduleMeeting} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Add meeting</button>
          </div>
        </div>
      )}
    
      <datalist id={contactList}>{people.map((p) => <option key={p} value={p} />)}</datalist>
      {meetings.length === 0 && !scheduling ? (
        <Empty>No meetings scheduled yet — the lead sits in &ldquo;Yet to Meet&rdquo; until one is held.</Empty>
      ) : (
        <MeetingTimeline
          key={draft.id}
          meetings={meetings}
          locked={locked}
          stored={stored}
          onCheckIn={onCheckIn}
          draft={draft}
          set={set}
          patchMeeting={patchMeeting}
          showGates={showGates}
          lastHeld={lastHeld}
          openLead={openLead}
          scheduledNext={scheduledNext}
          followUpError={followUpError}
          contactList={contactList}
        />
      )}
    </SectionCard>
  );
}

'use client';

import { MeetingStatus, OutreachMeeting } from '../../models/mockData';
import { MAX_MEETINGS, MEETING_STATUSES, canScheduleMeeting, nextMeetingNumber } from '../../models/outreachModel';
import { Empty, Field, ReadValue, SectionCard, errorInputCls } from '../../ui/inboundChips';
import { MeetingStatusChip } from '../../ui/outreachChips';
import { inputCls } from '../../utils/kams';
import { Dispatch, SetStateAction } from 'react';

export function OutreachCompanyCard({ exhausted, mArea, mDate, mError, mOffice, mTime, meetings, open, patchMeeting, scheduleMeeting, scheduling, setMArea, setMDate, setMError, setMOffice, setMTime, setScheduling }: {
  exhausted: boolean;
  mArea: string;
  mDate: string;
  mError: string | null;
  mOffice: string;
  mTime: string;
  meetings: OutreachMeeting[];
  open: OutreachMeeting | undefined;
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
  return (
    <SectionCard
      title={`Meetings · ${meetings.length} of ${MAX_MEETINGS}`}
      owner="crm"
      subtitle="Each logged Completed or Postponed"
      right={canScheduleMeeting(meetings) && !open && (
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
          All {MAX_MEETINGS} meetings were postponed and none was held. The PRD&apos;s lifecycle
          stops here: mark the lead <strong>Lost</strong> with reason &ldquo;Unable to meet (4 meetings)&rdquo;,
          or park it on <strong>Follow up</strong> with a long-term date. Nothing is decided for you.
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
    
      {meetings.length === 0 && !scheduling ? (
        <Empty>No meetings scheduled yet — the lead sits in &ldquo;Yet to Meet&rdquo; until one is held.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {meetings.map((m) => (
            <div key={m.n} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-gray-700">Meeting {m.n}</span>
                  <MeetingStatusChip s={m.status} />
                </div>
                <select
                  value={m.status}
                  onChange={(e) => patchMeeting(m.n, { status: e.target.value as MeetingStatus })}
                  className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white outline-none"
                >
                  {MEETING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5">
                <Field label="Date">
                  <input type="date" value={m.date || ''} onChange={(e) => patchMeeting(m.n, { date: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Time">
                  <input type="time" value={m.time || ''} onChange={(e) => patchMeeting(m.n, { time: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Area">
                  <input value={m.area || ''} onChange={(e) => patchMeeting(m.n, { area: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Office location">
                  <input value={m.officeLocation || ''} onChange={(e) => patchMeeting(m.n, { officeLocation: e.target.value })} className={inputCls} />
                </Field>
              </div>
    
              {m.status === 'Completed' ? (
                <Field label="Meeting notes" className="mt-2.5">
                  <textarea
                    value={m.notes || ''}
                    onChange={(e) => patchMeeting(m.n, { notes: e.target.value })}
                    rows={2}
                    placeholder="What was discussed, what they asked for…"
                    className={inputCls + ' resize-none'}
                  />
                </Field>
              ) : m.notes ? (
                <Field label="Meeting notes" hint="Recorded when this meeting was marked Completed" className="mt-2.5">
                  <ReadValue v={m.notes} />
                </Field>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

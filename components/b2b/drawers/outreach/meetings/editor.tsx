'use client';

import { useState } from 'react';
import { MeetingStatus, OutreachLead, OutreachMeeting } from '../../../models/mock-data';
import { CHECK_IN_REQUIRED_FROM, MEETING_STATUSES, needsCheckIn } from '../../../models/outreach';
import { meetingGaps } from '../../../models/outreach/reminders';
import { Field, ReadValue, errorInputCls } from '../../../ui/inbound-chips';
import { CheckInLine } from '../../../ui/check-in-capture';
import { MeetingStatusChip } from '../../../ui/outreach-chips';
import { inputCls } from '../../../constants/ui';
import { fmtMeetingDay } from './utils';

export function MeetingEditor({ m, locked, draft, set, patchMeeting, showGates, isLastHeld, scheduledNext, followUpError, contactList, onCheckIn, onDone }: {
  m: OutreachMeeting;
  locked: boolean;
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  patchMeeting: (n: number, patch: Partial<OutreachMeeting>) => void;
  showGates: boolean;
  isLastHeld: boolean;
  scheduledNext: boolean;
  followUpError: boolean;
  contactList: string;
  onCheckIn: (() => void) | null;
  onDone?: () => void;
}) {
  const gaps = meetingGaps(m);
  const mustCheckIn = needsCheckIn(m.date) && !m.checkIn;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-gray-800">Meeting {m.n}</span>
          <MeetingStatusChip s={m.status} />
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <select
              value={m.status}
              onChange={(e) => patchMeeting(m.n, { status: e.target.value as MeetingStatus })}
              className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white outline-none"
            >
              {MEETING_STATUSES.map((s) => (
                <option key={s} value={s} disabled={s === 'Completed' && mustCheckIn && m.status !== 'Completed'}>
                  {s === 'Completed' && mustCheckIn ? 'Completed — check in first' : s}
                </option>
              ))}
            </select>
          )}
          {onDone && !gaps.length && (
            <button onClick={onDone} className="px-2 py-1 text-[11px] rounded-md border border-gray-200 bg-white text-gray-600 hover:text-gray-900">Done</button>
          )}
        </div>
      </div>
      {locked ? (
        <p className="text-[11.5px] text-gray-600 mt-1.5">
          {[fmtMeetingDay(m.date), m.time, m.area, m.officeLocation].filter(Boolean).join(' · ') || 'No date or place recorded'}
        </p>
      ) : (
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
      )}

      <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Check-in</span>
        {m.checkIn ? <CheckInLine c={m.checkIn} /> : m.status === 'Scheduled' ? (
          onCheckIn ? (
            <>
              <button onClick={onCheckIn} className="px-2.5 py-1 rounded-md bg-[#0F766E] text-white font-semibold">Check in at the meeting</button>
              <span className="text-gray-500">On arrival: a photo and your exact location. Needed before it can be marked held.</span>
            </>
          ) : <span className="text-amber-700">Save this meeting first, then check in when you arrive.</span>
        ) : needsCheckIn(m.date)
          ? <span className={gaps.includes('check-in') ? 'text-red-600' : 'text-amber-700'}>No check-in. Set it back to Scheduled and check in, or it cannot be saved as held.</span>
          : <span className="text-gray-400">Not required for meetings before {fmtMeetingDay(CHECK_IN_REQUIRED_FROM)}</span>}
      </div>

      {m.status === 'Completed' ? (
        <>
          <Field label="Who you met" required className="mt-2.5" error={showGates && gaps.includes('who you met') ? 'Name the people in the room, with their roles.' : undefined}>
            <input
              value={m.metWith || ''}
              onChange={(e) => patchMeeting(m.n, { metWith: e.target.value })}
              list={contactList}
              placeholder="e.g. Asha (owner), Ravi (procurement)"
              className={showGates && gaps.includes('who you met') ? errorInputCls : inputCls}
            />
          </Field>
          <Field label="Meeting notes" required className="mt-2.5" error={gaps.includes('notes') ? 'A held meeting needs its notes before you can save.' : undefined}>
            <textarea
              value={m.notes || ''}
              onChange={(e) => patchMeeting(m.n, { notes: e.target.value })}
              rows={3}
              placeholder="What was discussed, what they asked for…"
              className={(String(m.notes || '').trim() ? inputCls : errorInputCls) + ' resize-y'}
            />
          </Field>
          {isLastHeld && (
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              <Field label="Next follow-up date" required={!scheduledNext} hint={scheduledNext ? 'Optional — the next meeting is already booked' : undefined}
                error={followUpError ? 'Set when you will next follow up after this visit.' : undefined}>
                <input type="date" value={draft.followUpDate || ''} onChange={(e) => set('followUpDate', e.target.value)} className={followUpError ? errorInputCls : inputCls} />
              </Field>
            </div>
          )}
        </>
      ) : m.notes ? (
        <Field label="Meeting notes" hint="Recorded when this meeting was marked Completed" className="mt-2.5">
          <ReadValue v={m.notes} />
        </Field>
      ) : null}
    </div>
  );
}

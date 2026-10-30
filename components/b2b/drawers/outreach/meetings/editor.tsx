'use client';

import { useState } from 'react';
import { MeetingStatus, OutreachLead, OutreachMeeting } from '../../../models/mock-data';
import { GeoPin, MEETING_STATUSES, pinMapUrl } from '../../../models/outreach';
import { meetingGaps } from '../../../models/outreach/reminders';
import { Field, ReadValue, errorInputCls } from '../../../ui/inbound-chips';
import { MeetingStatusChip } from '../../../ui/outreach-chips';
import { inputCls } from '../../../constants/ui';

function PinButton({ pin, onPin }: { pin?: GeoPin; onPin: (p: GeoPin) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const capture = () => {
    if (!navigator.geolocation) { setErr('This browser cannot share a location.'); return; }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        onPin({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy), at: new Date().toISOString() });
      },
      (e) => { setBusy(false); setErr(e.code === 1 ? 'Location permission was refused — allow it for this site and try again.' : 'Could not get a location fix. Try again outdoors.'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Live pin</span>
      {pin ? (
        <a href={pinMapUrl(pin)} target="_blank" rel="noreferrer" className="text-[#0F766E] hover:underline">
          {`Pinned ${pin.at.slice(0, 10)}${pin.accuracy ? ` · ±${pin.accuracy}m` : ''} · open map`}
        </a>
      ) : <span className="text-amber-700">Not pinned — take it at the client&apos;s office</span>}
      <button onClick={capture} disabled={busy} className="px-2 py-0.5 rounded-md border border-gray-200 bg-white text-gray-600 disabled:opacity-50">
        {busy ? 'Locating…' : pin ? 'Re-pin' : 'Pin my location now'}
      </button>
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}

export function MeetingEditor({ m, draft, set, patchMeeting, showGates, isLastHeld, scheduledNext, followUpError, contactList, onDone }: {
  m: OutreachMeeting;
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  patchMeeting: (n: number, patch: Partial<OutreachMeeting>) => void;
  showGates: boolean;
  isLastHeld: boolean;
  scheduledNext: boolean;
  followUpError: boolean;
  contactList: string;
  onDone?: () => void;
}) {
  const gaps = meetingGaps(m);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-gray-800">Meeting {m.n}</span>
          <MeetingStatusChip s={m.status} />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={m.status}
            onChange={(e) => patchMeeting(m.n, { status: e.target.value as MeetingStatus })}
            className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white outline-none"
          >
            {MEETING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {onDone && !gaps.length && (
            <button onClick={onDone} className="px-2 py-1 text-[11px] rounded-md border border-gray-200 bg-white text-gray-600 hover:text-gray-900">Done</button>
          )}
        </div>
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
              <Field label="Time" hint="Optional">
                <input type="time" value={draft.followUpTime || ''} onChange={(e) => set('followUpTime', e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          <PinButton pin={m.pin} onPin={(pin) => patchMeeting(m.n, { pin })} />
        </>
      ) : m.notes ? (
        <Field label="Meeting notes" hint="Recorded when this meeting was marked Completed" className="mt-2.5">
          <ReadValue v={m.notes} />
        </Field>
      ) : null}
    </div>
  );
}

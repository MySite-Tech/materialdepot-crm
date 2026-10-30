'use client';

import { OutreachMeeting } from '../../../models/mock-data';
import { meetingLocation, pinMapUrl } from '../../../models/outreach';
import { MeetingStatusChip } from '../../../ui/outreach-chips';
import { fmtMeetingDay } from './utils';

export function MeetingEntry({ m, gap, followUp, onEdit }: {
  m: OutreachMeeting;
  gap: string;
  followUp?: string;
  onEdit: () => void;
}) {
  const where = meetingLocation(m);
  const notes = String(m.notes || '').trim();
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[12px] font-bold text-gray-800">Meeting {m.n}</span>
          <MeetingStatusChip s={m.status} />
          <span className="text-[11.5px] text-gray-600 whitespace-nowrap">
            {m.date ? fmtMeetingDay(m.date) : <span className="text-amber-600">no date</span>}
            {m.time ? ` · ${m.time}` : ''}
          </span>
          {gap && <span className="text-[10.5px] text-gray-400 whitespace-nowrap">{gap}</span>}
        </div>
        <button onClick={onEdit} className="shrink-0 px-2 py-0.5 text-[11px] rounded-md border border-gray-200 bg-white text-gray-600 hover:text-gray-900">
          Edit
        </button>
      </div>
      <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-gray-500">
        {where && <span>{where}</span>}
        {m.status === 'Completed' && <span>Met: {String(m.metWith || '').trim() || <span className="text-gray-400">not recorded</span>}</span>}
        {m.pin && <a href={pinMapUrl(m.pin)} target="_blank" rel="noreferrer" className="text-[#0F766E] hover:underline">pinned</a>}
      </div>
      {notes
        ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{notes}</p>
        : m.status !== 'Completed' && <p className="mt-1.5 text-[11.5px] text-gray-400">No notes.</p>}
      {followUp && <p className="mt-1.5 text-[11px] text-gray-500">Next follow-up: <span className="font-semibold text-gray-700">{fmtMeetingDay(followUp)}</span></p>}
    </div>
  );
}

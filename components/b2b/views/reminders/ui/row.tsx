'use client';

import { REMINDER_KIND_LABEL, Reminder, daysLate, fmtFollowUp, fmtTime, minutesUntil, reminderState } from '../../../models/reminders';
import { TEAM_ACCENT } from '../constants';

function whenLine(r: Reminder, nowMs: number): { big: string; small: string; tone: string } {
  const s = reminderState(r, nowMs);
  if (s === 'overdue') {
    const d = daysLate(r.date, nowMs);
    return { big: fmtFollowUp(r.date, r.time), small: `${d} day${d === 1 ? '' : 's'} late`, tone: 'text-red-600' };
  }
  if (s === 'today') return { big: 'Any time', small: 'today', tone: 'text-gray-800' };
  if (s === 'later') return { big: r.time ? fmtTime(r.time) : 'Any time', small: fmtFollowUp(r.date), tone: 'text-gray-500' };
  const m = minutesUntil(r.dueAt, nowMs);
  return {
    big: fmtTime(r.time),
    small: m > 0 ? `in ${m} min` : m === 0 ? 'now' : `${-m >= 60 ? `${Math.floor(-m / 60)}h ` : ''}${-m % 60} min ago`,
    tone: m >= 0 ? 'text-[#B45309]' : 'text-red-600',
  };
}

export function ReminderRow({ r, nowMs, showOwner, onOpen }: {
  r: Reminder;
  nowMs: number;
  showOwner: boolean;
  onOpen: (r: Reminder) => void;
}) {
  const when = whenLine(r, nowMs);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="w-[84px] shrink-0">
        <div className={`text-[13px] font-bold leading-tight ${when.tone}`}>{when.big}</div>
        <div className="text-[10.5px] text-gray-400 mt-0.5">{when.small}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-gray-900 truncate max-w-full">{r.company || 'Unnamed'}</span>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: TEAM_ACCENT[r.team], background: `${TEAM_ACCENT[r.team]}14` }}
          >
            {REMINDER_KIND_LABEL[r.kind]}
          </span>
          {showOwner && <span className="text-[11px] text-gray-500">{r.owner || 'No owner'}</span>}
        </div>
        <div className="text-[11.5px] text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
          {r.contact && <span>{r.contact}</span>}
          {r.phone && <a href={`tel:${r.phone}`} className="font-mono text-[#0F766E] hover:underline">{r.phone}</a>}
        </div>
        {r.context && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{r.context}</p>}
      </div>
      {r.openId && (
        <button
          onClick={() => onOpen(r)}
          className="shrink-0 px-3 py-1.5 rounded-md text-[12px] font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        >
          Open
        </button>
      )}
    </li>
  );
}

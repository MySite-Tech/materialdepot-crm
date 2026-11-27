'use client';

import { REMINDER_KIND_LABEL, REMINDER_TEAM_LABEL, Reminder, daysLate, fmtFollowUp, fmtTime, minutesUntil, reminderState } from '../../../models/reminders';
import { TEAM_ACCENT } from '../constants';

const digits = (s: string | undefined) => String(s || '').replace(/\D/g, '');

const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function whenCell(r: Reminder, nowMs: number): { main: string; sub: string; tone: string } {
  const s = reminderState(r, nowMs);
  if (s === 'overdue') {
    const d = daysLate(r.date, nowMs);
    return { main: fmtFollowUp(r.date), sub: `${d} day${d === 1 ? '' : 's'} late${r.time ? ` · was ${fmtTime(r.time)}` : ''}`, tone: 'text-red-600' };
  }
  if (s === 'today') return { main: 'Any time', sub: 'Today', tone: 'text-gray-900' };
  if (s === 'later') return { main: weekday(r.date), sub: r.time ? fmtTime(r.time) : 'Any time', tone: 'text-gray-900' };
  const m = minutesUntil(r.dueAt, nowMs);
  const ago = -m >= 60 ? `${Math.floor(-m / 60)}h ${-m % 60}m ago` : `${-m} min ago`;
  return { main: fmtTime(r.time), sub: m > 0 ? `in ${m} min` : m === 0 ? 'now' : ago, tone: m >= 0 ? 'text-amber-700' : 'text-gray-900' };
}

function names(r: Reminder): { title: string; named: boolean; contact?: string } {
  const company = String(r.company || '').trim();
  const isNumber = /^[+\d\s-]+$/.test(company) && digits(company).length >= 10;
  const contact = r.contact && r.contact.trim() !== company ? r.contact.trim() : undefined;
  if (company && !isNumber) return { title: company, named: true, contact };
  if (contact) return { title: contact, named: true };
  return { title: 'Not named yet', named: false };
}

export function ReminderRow({ r, nowMs, showOwner, onOpen }: {
  r: Reminder;
  nowMs: number;
  showOwner: boolean;
  onOpen: (r: Reminder) => void;
}) {
  const when = whenCell(r, nowMs);
  const who = names(r);
  const open = r.openId ? () => onOpen(r) : undefined;
  return (
    <tr onClick={open} className={`border-t border-gray-100 align-top ${open ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
      <td className="pl-5 pr-3 py-3 whitespace-nowrap">
        <div className={`text-[14px] font-medium tabular-nums ${when.tone}`}>{when.main}</div>
        <div className="text-[12px] text-gray-500 tabular-nums">{when.sub}</div>
      </td>
      <td className="px-3 py-3 min-w-[200px]">
        <div className={`text-[14px] font-medium truncate max-w-[280px] ${who.named ? 'text-gray-900' : 'text-gray-400'}`}>{who.title}</div>
        <div className="text-[12px] text-gray-500 flex items-center gap-1.5 min-w-0">
          {who.contact && <span className="truncate max-w-[160px]">{who.contact}</span>}
          {who.contact && r.phone && <span className="text-gray-300">·</span>}
          {r.phone && (
            <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="tabular-nums text-gray-600 hover:text-gray-900 hover:underline">
              {r.phone}
            </a>
          )}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-[13px] text-gray-800">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAM_ACCENT[r.team] }} />
          {REMINDER_TEAM_LABEL[r.team]}
        </div>
        <div className="text-[12px] text-gray-500 pl-3">
          {REMINDER_KIND_LABEL[r.kind]}{r.topic === 'cart' && r.stage ? ` · ${r.stage}` : ''}
        </div>
      </td>
      {showOwner && <td className="px-3 py-3 text-[13px] text-gray-700 whitespace-nowrap">{r.owner || <span className="text-gray-400">No owner</span>}</td>}
      <td className="px-3 py-3">
        <p className="text-[13px] text-gray-600 line-clamp-2 max-w-[460px]">{r.context || <span className="text-gray-300">—</span>}</p>
      </td>
      <td className="pl-3 pr-5 py-3 text-right">
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); open(); }}
            className="h-8 px-3 rounded-md text-[13px] border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            Open
          </button>
        )}
      </td>
    </tr>
  );
}

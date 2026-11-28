'use client';

import type { TicketFollowUp } from '../models/client';
import { fmtFollowUp, fmtTime } from '../models/reminders';
import { fmtDay } from './inbound-chips';

const daysLate = (date: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);

export function TicketNext({ f, touched, today }: { f?: TicketFollowUp; touched: boolean; today: string }) {
  if (!touched) return <span className="text-amber-700 font-semibold whitespace-nowrap">No follow-up yet</span>;
  const next = f?.next;
  if (!next) return <span className="text-amber-700 whitespace-nowrap">No next date set</span>;
  const late = daysLate(next.date, today);
  const cls = late > 0 ? 'text-red-600 font-semibold' : late === 0 ? 'text-amber-700 font-semibold' : 'text-gray-700';
  return (
    <span className={`whitespace-nowrap ${cls}`}>
      {late > 0 ? `${late}d overdue` : late === 0 ? 'Today' : fmtDay(next.date)}
      {next.time && <span className="font-normal text-gray-400"> · {fmtTime(next.time)}</span>}
    </span>
  );
}

export function TicketLast({ f }: { f?: TicketFollowUp }) {
  if (!f) return <span className="text-gray-300">—</span>;
  const i = f.last;
  return (
    <div className="max-w-[260px]">
      <div className="text-gray-600 whitespace-nowrap">{i.type} · {fmtDay(String(i.date).slice(0, 10))}{i.loggedBy ? ` · ${i.loggedBy}` : ''}</div>
      {i.summary && <div className="text-[10.5px] text-gray-400 truncate" title={i.summary}>{i.summary}</div>}
    </div>
  );
}

export function TicketFollowUpLog({ f, label, onLog }: { f?: TicketFollowUp; label: string; onLog?: () => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-md px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11.5px] font-medium text-gray-500">KAM follow-ups on this {label}{f ? ` · ${f.log.length}` : ''}</div>
        {onLog && <button onClick={(e) => { e.stopPropagation(); onLog(); }} className="text-[12px] font-semibold text-[#0F766E] hover:underline">+ Log follow-up</button>}
      </div>
      {!f ? (
        <p className="text-[12px] text-amber-700 mt-1">Nothing logged on this {label} yet.</p>
      ) : (
        <ul className="mt-1 flex flex-col divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {f.log.map((i) => (
            <li key={i.id} className="py-1.5">
              <div className="text-[11.5px] text-gray-500">{i.type} · {fmtDay(String(i.date).slice(0, 10))}{i.loggedBy ? ` · ${i.loggedBy}` : ''}</div>
              {i.summary && <p className="text-[12px] text-gray-800 whitespace-pre-wrap break-words">{i.summary}</p>}
              <p className="text-[11px] text-gray-400">{i.nextFollowUpDate ? `Next follow-up ${fmtFollowUp(i.nextFollowUpDate, i.nextFollowUpTime)}` : 'No next follow-up set'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

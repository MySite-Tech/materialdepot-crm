'use client';

import { OutreachLead } from '../../../models/mock-data';
import { STUDIO_WAITLIST_URL, WaitlistSignup } from '../../../models/outreach';
import { HANDOVER_TAT_HOURS, hoursSince } from '../../../models/outreach/handover';
import { waitlistFor } from '../../../models/outreach/kpis';
import { REMINDER_ORDER, Reminder, ReminderLevel, outreachReminders } from '../../../models/outreach/reminders';
import { Empty } from '../../../ui/inbound-chips';
import { OutreachStatusBadge } from '../../../ui/outreach-chips';
import { TodayTable } from '../lists/tables';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 25;

const LEVEL: Record<ReminderLevel, { title: string; dot: string; text: string }> = {
  overdue: { title: 'Overdue', dot: '#EF4444', text: 'text-red-700' },
  today:   { title: 'Today',   dot: '#F59E0B', text: 'text-amber-800' },
  todo:    { title: 'To do',   dot: '#9CA3AF', text: 'text-gray-600' },
};

function kamReminders(l: OutreachLead, nowMs: number): Reminder[] {
  const h = l.handover;
  if (!h || h.status !== 'Pending') return [];
  const hrs = Math.floor(hoursSince(h.sentAt, nowMs));
  const left = HANDOVER_TAT_HOURS - hrs;
  return [{
    key: `${l.id}:kam`,
    level: left < 0 ? 'overdue' : left <= 12 ? 'today' : 'todo',
    text: left < 0
      ? `Handover from ${l.bm} is ${-left}h past the ${HANDOVER_TAT_HOURS}h sign-off window — accept or reject it`
      : `Handover from ${l.bm} — sign off within ${left}h`,
  }];
}

export function MyDay({ leads, today, nowMs, waitlist, isKam, onOpen }: {
  leads: OutreachLead[];
  today: string;
  nowMs: number;
  waitlist: Map<string, WaitlistSignup> | null;
  isKam: boolean;
  onOpen: (id: string) => void;
}) {
  const items = useMemo(() => leads
    .map((lead) => {
      const w = waitlistFor(lead, waitlist);
      const reminders = isKam
        ? kamReminders(lead, nowMs)
        : outreachReminders(lead, { today, nowMs, onWaitlist: w === undefined ? null : !!w });
      return { lead, reminders };
    })
    .filter((x) => x.reminders.length)
    .sort((a, b) => REMINDER_ORDER.indexOf(a.reminders[0].level) - REMINDER_ORDER.indexOf(b.reminders[0].level)
      || b.reminders.length - a.reminders.length),
  [leads, today, nowMs, waitlist, isKam]);

  const counts = useMemo(() => {
    const c: Record<ReminderLevel, number> = { overdue: 0, today: 0, todo: 0 };
    for (const x of items) for (const r of x.reminders) c[r.level] += 1;
    return c;
  }, [items]);

  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [items.length]);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const rows = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard?.writeText(STUDIO_WAITLIST_URL).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="flex flex-col gap-3">
      {!isKam && <TodayTable leads={leads} today={today} onOpen={onOpen} />}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h3 className="text-[12px] font-bold text-gray-800">{isKam ? 'Handovers waiting on you' : 'Reminders'}</h3>
          {REMINDER_ORDER.map((lv) => (
            <span key={lv} className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: LEVEL[lv].dot }} />
              {counts[lv]} {LEVEL[lv].title.toLowerCase()}
            </span>
          ))}
          {!isKam && (
            <button onClick={copyLink} className="ml-auto text-[11px] font-semibold text-[#0F766E] hover:underline">
              {copied ? 'Copied' : 'Copy Studio Space waitlist link'}
            </button>
          )}
        </div>
        {!rows.length ? (
          <div className="py-10"><Empty>{isKam ? 'No handover is waiting for your sign-off.' : 'Nothing outstanding — every lead is up to date.'}</Empty></div>
        ) : (
          <ul>
            {rows.map(({ lead, reminders }) => (
              <li key={lead.id} onClick={() => onOpen(lead.id)} className="px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12.5px] font-semibold text-gray-900 truncate">{lead.company}</span>
                  <OutreachStatusBadge s={lead.status} />
                  <span className="text-[10.5px] text-gray-400 truncate">{[lead.contactPerson, lead.bm].filter(Boolean).join(' · ')}</span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {reminders.map((r) => (
                    <li key={r.key} className={`flex items-start gap-1.5 text-[11.5px] leading-snug ${LEVEL[r.level].text}`}>
                      <span className="w-1.5 h-1.5 rounded-full mt-[5px] shrink-0" style={{ background: LEVEL[r.level].dot }} />
                      {r.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {items.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              {`Showing ${page * PAGE_SIZE + 1}–${Math.min(items.length, (page + 1) * PAGE_SIZE)} of ${items.length} leads`}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

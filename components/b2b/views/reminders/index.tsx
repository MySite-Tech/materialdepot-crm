'use client';

import { useMemo, useState } from 'react';
import { REMINDER_LEAD_MINUTES, REMINDER_REFRESH_MS, REMINDER_UPCOMING_DAYS, Reminder, groupReminders, scopeReminders } from '../../models/reminders';
import type { RemindersLoad } from '../../hooks/use-reminders';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { Spinner } from '../../ui/inbound-chips';
import { EVERYONE, MINE } from './constants';
import { ReminderSection } from './ui/section';
import { OpenRecord, ReminderRecord } from './ui/record';

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function Reminders({ reminders, team, viewer, alerts }: {
  reminders: RemindersLoad;
  team: B2BTeamLoad;
  viewer: Viewer;
  alerts: { permission: NotificationPermission | 'unsupported'; enable: () => void };
}) {
  const { data, all, mine, people, nowMs, loading, failed, loadedAt, reload } = reminders;
  const [who, setWho] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenRecord | null>(null);
  const onOpen = (r: Reminder) => { if (r.openId) setOpened({ team: r.team, id: r.openId }); };
  const picked = who ?? (viewer.isManager && !viewer.memberships.length ? EVERYONE : MINE);

  const list = useMemo(() => {
    if (!viewer.isManager || picked === MINE) return mine;
    if (picked === EVERYONE) return all;
    return scopeReminders(all, people.find((p) => p.phone === picked) ?? null);
  }, [viewer.isManager, picked, mine, all, people]);

  const groups = useMemo(() => groupReminders(list, nowMs), [list, nowMs]);
  const untimed = list.length > 0 && !list.some((r) => r.time);
  const showOwner = viewer.isManager && picked !== MINE;

  return (
    <div className="p-4 md:p-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900">Reminders</h2>
          <p className="text-[12px] text-gray-500 mt-0.5 max-w-[640px] leading-snug">
            Every follow-up and meeting with a date, from Inbound, Outreach and KAM. One with a time moves into Due now {REMINDER_LEAD_MINUTES} minutes before it.
            {' '}Log the call or move the date and it leaves this list.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {viewer.isManager && (
            <select value={picked} onChange={(e) => setWho(e.target.value)} className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] bg-white">
              <option value={MINE}>Mine</option>
              <option value={EVERYONE}>Everyone</option>
              {people.map((p) => <option key={p.phone} value={p.phone}>{p.name}</option>)}
            </select>
          )}
          {alerts.permission === 'default' && (
            <button onClick={alerts.enable} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#1A1A1A] text-white">
              Turn on desktop alerts
            </button>
          )}
          {alerts.permission === 'granted' && <span className="text-[11px] text-gray-500">Desktop alerts on</span>}
          {alerts.permission === 'denied' && <span className="text-[11px] text-gray-500">Desktop alerts are blocked in this browser&apos;s site settings</span>}
        </div>
      </div>

      {failed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-amber-800">The B2B database did not answer, so this list may be missing reminders. Nothing below means &quot;none due&quot;.</p>
          <button onClick={reload} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-white border border-amber-300 text-amber-800">Try again</button>
        </div>
      )}

      {loading ? <Spinner label="Loading reminders…" /> : <>
        {untimed && (
          <p className="text-[11.5px] text-gray-500 mb-3">
            None of these has a time yet. Add one beside the next follow-up date in the call log, the meeting or the PI, and it shows up here an hour before.
          </p>
        )}
        <ReminderSection
          title="Due now" accent="#B45309" resetKey={picked}
          rule={`Timed, from ${REMINDER_LEAD_MINUTES} min before until the end of the day`}
          list={groups.now} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen}
          empty="Nothing due in the next hour."
        />
        <ReminderSection
          title="Today, any time" resetKey={picked}
          rule="Due today with no time set"
          list={groups.today} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen}
        />
        <ReminderSection
          title="Missed" accent="#DC2626" resetKey={picked}
          rule="The date has passed and nothing was logged since. Most recent first"
          list={groups.overdue} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen}
        />
        <ReminderSection
          title="Coming up" resetKey={picked}
          rule={`Later today and the next ${REMINDER_UPCOMING_DAYS} days`}
          list={groups.later} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen}
          empty={`Nothing booked for the next ${REMINDER_UPCOMING_DAYS} days.`}
        />
      </>}

      {loadedAt && (
        <p className="text-[10.5px] text-gray-400 mt-2">
          Updated {clock(loadedAt)}. It refreshes every {REMINDER_REFRESH_MS / 60_000} minutes and after every save, while this page is open.
        </p>
      )}

      {opened && data && (
        <ReminderRecord key={`${opened.team}:${opened.id}`} open={opened} data={data} team={team} viewer={viewer} onClose={() => setOpened(null)} />
      )}
    </div>
  );
}

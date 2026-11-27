'use client';

import { useMemo, useState } from 'react';
import { REMINDER_REFRESH_MS, REMINDER_TEAM_LABEL, REMINDER_TOPIC_LABEL, Reminder, ReminderTopic, groupReminders, scopeReminders } from '../../models/reminders';
import type { RemindersLoad } from '../../hooks/use-reminders';
import type { B2BTeam, B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { Spinner } from '../../ui/inbound-chips';
import { ALL, BUCKETS, Bucket, EVERYONE, MINE, TEAM_ACCENT } from './constants';
import { BucketTabs, Segmented } from './ui/controls';
import { ReminderTable } from './ui/table';
import { OpenRecord, ReminderRecord } from './ui/record';

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const TEAMS: B2BTeam[] = ['inbound', 'outreach', 'kam'];
const TOPICS: ReminderTopic[] = ['touch', 'cart'];
const digits = (s: string) => s.replace(/\D/g, '');

const matches = (r: Reminder, q: string): boolean => {
  const d = digits(q);
  if (d.length >= 3 && digits(r.phone || '').includes(d)) return true;
  return [r.company, r.contact, r.owner, r.context].some((v) => String(v || '').toLowerCase().includes(q));
};

export default function Reminders({ reminders, team, viewer, alerts }: {
  reminders: RemindersLoad;
  team: B2BTeamLoad;
  viewer: Viewer;
  alerts: { permission: NotificationPermission | 'unsupported'; enable: () => void };
}) {
  const { data, all, mine, people, nowMs, loading, failed, loadedAt, reload } = reminders;
  const [who, setWho] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [topic, setTopic] = useState<ReminderTopic | typeof ALL>(ALL);
  const [teamF, setTeamF] = useState<B2BTeam | typeof ALL>(ALL);
  const [q, setQ] = useState('');
  const [opened, setOpened] = useState<OpenRecord | null>(null);
  const onOpen = (r: Reminder) => { if (r.openId) setOpened({ team: r.team, id: r.openId }); };
  const picked = who ?? (viewer.isManager && !viewer.memberships.length ? EVERYONE : MINE);

  const list = useMemo(() => {
    if (!viewer.isManager || picked === MINE) return mine;
    if (picked === EVERYONE) return all;
    return scopeReminders(all, people.find((p) => p.phone === picked) ?? null);
  }, [viewer.isManager, picked, mine, all, people]);

  const groups = useMemo(() => groupReminders(list, nowMs), [list, nowMs]);
  const counts = { now: groups.now.length, today: groups.today.length, overdue: groups.overdue.length, later: groups.later.length };
  const active: Bucket = bucket ?? (BUCKETS.find((b) => counts[b.key] > 0)?.key || 'now');
  const meta = BUCKETS.find((b) => b.key === active)!;

  const needle = q.trim().toLowerCase();
  const searched = useMemo(() => (needle ? groups[active].filter((r) => matches(r, needle)) : groups[active]), [groups, active, needle]);
  const topicCount = (t: ReminderTopic | typeof ALL) => searched.filter((r) => t === ALL || r.topic === t).length;
  const byTopic = useMemo(() => searched.filter((r) => topic === ALL || r.topic === topic), [searched, topic]);
  const teamCount = (t: B2BTeam | typeof ALL) => byTopic.filter((r) => t === ALL || r.team === t).length;
  const shown = useMemo(() => byTopic.filter((r) => teamF === ALL || r.team === teamF), [byTopic, teamF]);

  const showOwner = viewer.isManager && picked !== MINE;
  const untimed = list.length > 0 && !list.some((r) => r.time);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold text-gray-900">Reminders</h2>
          <p className="text-[13px] text-gray-500 mt-1">
            Follow-ups and meetings from Inbound, Outreach and KAM. Logging the call or moving the date clears one.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {viewer.isManager && (
            <select value={picked} onChange={(e) => setWho(e.target.value)} aria-label="Whose reminders" className="h-9 border border-gray-200 rounded-md px-2.5 text-[13px] bg-white">
              <option value={MINE}>Mine</option>
              <option value={EVERYONE}>Everyone</option>
              {people.map((p) => <option key={p.phone} value={p.phone}>{p.name}</option>)}
            </select>
          )}
          {alerts.permission === 'default' && (
            <button onClick={alerts.enable} className="h-9 px-3 rounded-md text-[13px] border border-gray-200 bg-white text-gray-800 hover:bg-gray-50">
              Turn on desktop alerts
            </button>
          )}
          {alerts.permission === 'granted' && <span className="text-[12px] text-gray-500">Desktop alerts on</span>}
          {alerts.permission === 'denied' && <span className="text-[12px] text-gray-500">Desktop alerts are blocked in this browser&apos;s site settings</span>}
        </div>
      </div>

      {failed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[13px] text-amber-800">The B2B database did not answer, so this list may be missing reminders. An empty tab does not mean nothing is due.</p>
          <button onClick={reload} className="h-8 px-3 rounded-md text-[13px] bg-white border border-amber-300 text-amber-800">Try again</button>
        </div>
      )}

      {loading ? <Spinner label="Loading reminders…" /> : (
        <section className="bg-white rounded-xl border border-gray-200">
          <BucketTabs active={active} counts={counts} onPick={setBucket} />

          <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-gray-100">
            <Segmented
              label="Topic" value={topic} onChange={setTopic}
              options={[{ key: ALL, label: 'All', count: topicCount(ALL) }, ...TOPICS.map((t) => ({ key: t, label: REMINDER_TOPIC_LABEL[t], count: topicCount(t) }))]}
            />
            <Segmented
              label="Team" value={teamF} onChange={setTeamF}
              options={[{ key: ALL, label: 'All teams', count: teamCount(ALL) }, ...TEAMS.map((t) => ({ key: t, label: REMINDER_TEAM_LABEL[t], count: teamCount(t), dot: TEAM_ACCENT[t] }))]}
            />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search reminders"
              className="ml-auto h-9 w-full sm:w-[220px] border border-gray-200 rounded-md px-3 text-[13px] bg-white"
            />
          </div>

          <p className="px-5 pt-3 text-[12px] text-gray-500">{meta.rule}</p>
          {untimed && active === 'now' && (
            <p className="px-5 pt-1 text-[12px] text-gray-500">
              None of these reminders has a time. Add one beside the next follow-up date and it shows here an hour before.
            </p>
          )}

          <div className="mt-2">
            <ReminderTable
              list={shown} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen}
              empty={needle || topic !== ALL || teamF !== ALL ? 'Nothing here matches these filters' : meta.empty}
              resetKey={`${picked}|${active}|${topic}|${teamF}|${needle}`}
            />
          </div>
        </section>
      )}

      {loadedAt && (
        <p className="text-[12px] text-gray-400 mt-3">
          Updated {clock(loadedAt)}. Refreshes every {REMINDER_REFRESH_MS / 60_000} minutes and after every save while this page is open.
        </p>
      )}

      {opened && data && (
        <ReminderRecord key={`${opened.team}:${opened.id}`} open={opened} data={data} team={team} viewer={viewer} onClose={() => setOpened(null)} />
      )}
    </div>
  );
}

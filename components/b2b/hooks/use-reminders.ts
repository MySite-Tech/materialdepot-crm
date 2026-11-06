'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchB2BData, onB2BWrite } from '@/lib/b2b';
import type { B2BData } from '@/lib/b2b';
import { membershipIn } from '@/lib/b2b/team/utils';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { REMINDER_REFRESH_MS, REMINDER_TICK_MS, Reminder, ReminderPerson, activeReminderCount, buildReminders, scopeReminders } from '../models/reminders';

const WRITE_DEBOUNCE_MS = 1500;

export interface RemindersLoad {
  data: B2BData | null;
  all: Reminder[];
  mine: Reminder[];
  me: ReminderPerson;
  people: ReminderPerson[];
  nowMs: number;
  activeCount: number;
  loading: boolean;
  failed: boolean;
  loadedAt: number | null;
  reload: () => void;
}

export function useReminders(team: B2BTeamLoad, viewer: Viewer): RemindersLoad {
  const [data, setData] = useState<B2BData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const latest = useRef(0);
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    const run = ++latest.current;
    lastLoad.current = Date.now();
    fetchB2BData()
      .then((d) => {
        if (run !== latest.current) return;
        setData(d);
        setFailed(d.failed.length > 0);
        setLoadedAt(Date.now());
      })
      .catch((e) => {
        if (run !== latest.current) return;
        console.error('[b2b] reminders load failed', e);
        setFailed(true);
      })
      .finally(() => { if (run === latest.current) setLoading(false); });
  }, []);

  useEffect(() => {
    if (team.loading) return;
    load();
    const refresh = setInterval(() => { if (!document.hidden) load(); }, REMINDER_REFRESH_MS);
    const tick = setInterval(() => { if (!document.hidden) setNowMs(Date.now()); }, REMINDER_TICK_MS);
    const onVisible = () => {
      if (document.hidden) return;
      setNowMs(Date.now());
      if (Date.now() - lastLoad.current >= REMINDER_REFRESH_MS) load();
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const off = onB2BWrite(() => {
      clearTimeout(debounce);
      debounce = setTimeout(load, WRITE_DEBOUNCE_MS);
    });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
      clearTimeout(debounce);
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [team.loading, load]);

  const inboundName = useMemo(() => {
    const byId = new Map(team.members.filter((m) => m.team === 'inbound' && m.kylasUserId != null).map((m) => [m.kylasUserId as number, m.name]));
    return (id: number | undefined) => (id != null ? byId.get(id) : undefined);
  }, [team.members]);

  const all = useMemo(
    () => (data ? buildReminders({ inbound: data.inbound, outreach: data.outreach, clients: data.clients, orders: data.kam, inboundOwnerName: inboundName }) : []),
    [data, inboundName],
  );

  const me = useMemo<ReminderPerson>(() => ({
    name: viewer.member?.name || viewer.name,
    phone: viewer.phone,
    inboundKylasId: membershipIn(viewer, 'inbound')?.kylasUserId ?? null,
  }), [viewer]);

  const people = useMemo<ReminderPerson[]>(() => {
    const byPhone = new Map<string, ReminderPerson>();
    for (const m of team.members) {
      if (!m.active) continue;
      const p = byPhone.get(m.phone) ?? { name: m.name, phone: m.phone, inboundKylasId: null };
      if (m.team === 'inbound' && m.kylasUserId != null) p.inboundKylasId = m.kylasUserId;
      byPhone.set(m.phone, p);
    }
    return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [team.members]);

  const mine = useMemo(() => scopeReminders(all, me), [all, me]);
  const activeCount = useMemo(() => activeReminderCount(mine, nowMs), [mine, nowMs]);

  return { data, all, mine, me, people, nowMs, activeCount, loading, failed, loadedAt, reload: load };
}

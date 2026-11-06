'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REMINDER_KIND_LABEL, REMINDER_LEAD_MINUTES, Reminder, fmtTime, reminderState } from '../models/reminders';

const SEEN_KEY = 'b2b.reminders.alerted';
const SEEN_KEEP_MS = 3 * 86_400_000;

type Permission = NotificationPermission | 'unsupported';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function readSeen(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* storage blocked: alerts may repeat after a reload */ }
}

function show(title: string, body: string, onClick: () => void) {
  const opts: NotificationOptions = { body, tag: 'b2b-reminders' };
  try {
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch {
    navigator.serviceWorker?.getRegistration().then((reg) => reg?.showNotification(title, opts)).catch(() => undefined);
  }
}

export function useReminderAlerts(mine: Reminder[], nowMs: number, ready: boolean, onOpen: () => void) {
  const [permission, setPermission] = useState<Permission>('unsupported');
  const seen = useRef<Record<string, number> | null>(null);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => { setPermission(supported() ? Notification.permission : 'unsupported'); }, []);

  useEffect(() => {
    if (!ready || permission !== 'granted') return;
    if (!seen.current) seen.current = readSeen();
    const marks = seen.current;
    const fresh = mine.filter((r) => {
      if (!r.time) return false;
      const s = reminderState(r, nowMs);
      const recent = s === 'soon' || (s === 'due' && nowMs - r.dueAt < REMINDER_LEAD_MINUTES * 60_000);
      return recent && !marks[`${r.key}@${r.dueAt}`];
    });
    if (!fresh.length) return;
    for (const r of fresh) marks[`${r.key}@${r.dueAt}`] = r.dueAt;
    for (const [k, due] of Object.entries(marks)) if (nowMs - due > SEEN_KEEP_MS) delete marks[k];
    writeSeen(marks);

    const first = fresh[0];
    show(
      fresh.length === 1 ? `${fmtTime(first.time)} · ${first.company}` : `${fresh.length} reminders due within the hour`,
      fresh.length === 1
        ? [REMINDER_KIND_LABEL[first.kind], first.contact, first.phone].filter(Boolean).join(' · ')
        : fresh.slice(0, 4).map((r) => `${fmtTime(r.time)} ${r.company}`).join('\n'),
      () => open.current(),
    );
  }, [mine, nowMs, ready, permission]);

  const enable = useCallback(async () => {
    if (!supported()) return;
    setPermission(await Notification.requestPermission());
  }, []);

  return { permission, enable };
}

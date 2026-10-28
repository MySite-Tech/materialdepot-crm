'use client';

import { OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { orderVerified } from '../../../models/outreach/handover';
import { PoolLead } from '../../../models/outreach/intake';
import { OutreachKpiKey, OutreachKpis, waitlistFor } from '../../../models/outreach/kpis';
import { outreachReminders } from '../../../models/outreach/reminders';
import { KAM_GROUPS, REP_GROUPS } from '../constants';
import { TileHint } from '../lenses';
import { kamReminders, lensMatches, sortLens } from '../lenses/utils';
import { Lens, LensRow, WorkLens } from '../types';
import { useMemo } from 'react';

const day = (d: string | undefined) => String(d || '').slice(0, 10);
const lakh = (n: number) => `₹${Math.round((n / 1_00_000) * 10) / 10}L`;

export function useOutreachLenses({ leads, kpis, lens, isKam, today, nowMs, waitlist, pool }: {
  leads: OutreachLead[];
  kpis: OutreachKpis;
  lens: Lens;
  isKam: boolean;
  today: string;
  nowMs: number;
  waitlist: Map<string, WaitlistSignup> | null;
  pool: PoolLead[] | null;
}) {
  const rows = useMemo<LensRow[]>(() => leads.map((lead) => {
    const w = waitlistFor(lead, waitlist);
    return {
      lead,
      reminders: isKam ? kamReminders(lead, nowMs) : outreachReminders(lead, { today, nowMs, onWaitlist: w === undefined ? null : !!w }),
    };
  }), [leads, isKam, today, nowMs, waitlist]);

  const groups = isKam ? KAM_GROUPS : REP_GROUPS;

  const lists = useMemo(() => {
    const ctx = { today, nowMs };
    const keys = groups.flatMap((g) => [...(g.head ? [g.head] : []), ...g.lenses]);
    return Object.fromEntries(keys.map((k) => [k, sortLens(k, rows.filter((r) => lensMatches(k, r, ctx)), ctx)])) as Partial<Record<WorkLens, LensRow[]>>;
  }, [rows, groups, today, nowMs]);

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v?.length ?? 0])) as Partial<Record<WorkLens, number>>,
    [lists],
  );

  const hints = useMemo(() => {
    const h: Partial<Record<WorkLens, TileHint>> = {};
    const firstAt = (lists.meetings ?? [])
      .map((r) => (r.lead.meetings || []).find((m) => m.status === 'Scheduled' && day(m.date) === today)?.time)
      .filter(Boolean).sort()[0];
    if (firstAt) h.meetings = { text: `first at ${firstAt}` };
    const late = (lists.followups ?? []).filter((r) => day(r.lead.followUpDate) < today).length;
    if (late) h.followups = { text: `${late} overdue`, warn: true };
    if (pool === null) h.inbox = { text: 'pool unknown', warn: true };
    else if (pool.length) h.inbox = { text: `${pool.length} unassigned` };
    const pi = (lists.pi ?? []).reduce((a, r) => a + (Number(r.lead.orderValue) || 0), 0);
    if (pi) h.pi = { text: lakh(pi) };
    const won = lists.won ?? [];
    const unverified = won.filter((r) => !orderVerified(r.lead)).length;
    if (unverified) h.won = { text: `${unverified} not verified`, warn: true };
    const signoffLate = (lists.signoff ?? []).filter((r) => r.reminders[0]?.level === 'overdue').length;
    if (signoffLate) h.signoff = { text: `${signoffLate} past 48h`, warn: true };
    return h;
  }, [lists, today, pool]);

  const kpiKey = lens.startsWith('kpi:') ? (lens.slice(4) as OutreachKpiKey) : null;
  const kpi = useMemo(() => {
    if (!kpiKey) return null;
    const all = kpis[kpiKey].rows;
    const byId = new Map(rows.map((r) => [r.lead.id, r]));
    const visible: LensRow[] = all
      .filter((k) => byId.has(k.lead.id))
      .map((k) => ({ ...byId.get(k.lead.id)!, kpi: k }))
      .sort((a, b) => Number(b.kpi!.counts) - Number(a.kpi!.counts) || String(b.kpi!.at || '').localeCompare(String(a.kpi!.at || '')));
    return { key: kpiKey, total: all.length, counted: all.filter((k) => k.counts).length, visible };
  }, [kpiKey, kpis, rows]);

  return { groups, lists, counts, hints, kpi };
}

'use client';

import { OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { waitlistFor } from '../../../models/outreach/kpis';
import { outreachReminders } from '../../../models/outreach/reminders';
import { KAM_GROUPS, PERIOD_LENSES, REP_GROUPS, SIDE_LENSES } from '../constants';
import { kamReminders, lensMatches, outreachDealCtx, sortLens } from '../lenses/utils';
import { LensRow, WorkLens } from '../types';
import { outreachPhones } from '@/lib/b2b';
import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';
import { leadDeals } from '@/lib/b2b/inbound-deals/utils';
import { useMemo } from 'react';

const HEAD_UNION: Partial<Record<WorkLens, WorkLens[]>> = { other: ['inbox', 'handoff', 'won', 'lost'] };

export function useOutreachLenses({ leads, pipeline, isKam, today, nowMs, waitlist, dealsByPhone }: {
  leads: OutreachLead[];
  pipeline: OutreachLead[];
  isKam: boolean;
  today: string;
  nowMs: number;
  waitlist: Map<string, WaitlistSignup> | null;
  dealsByPhone: Map<string, OpenDeal[]> | null;
}) {
  const rows = useMemo<LensRow[]>(() => leads.map((lead) => {
    const w = waitlistFor(lead, waitlist);
    return {
      lead,
      reminders: isKam ? kamReminders(lead, nowMs) : outreachReminders(lead, { today, nowMs, onWaitlist: w === undefined ? null : !!w }),
      deal: outreachDealCtx(lead, dealsByPhone ? leadDeals(outreachPhones(lead), dealsByPhone) : undefined),
    };
  }), [leads, isKam, today, nowMs, waitlist, dealsByPhone]);

  const groups = isKam ? KAM_GROUPS : REP_GROUPS;

  const pipelineIds = useMemo(() => new Set(pipeline.map((l) => l.id)), [pipeline]);

  const lists = useMemo(() => {
    const ctx = { today, nowMs };
    const inPeriod = rows.filter((r) => pipelineIds.has(r.lead.id));
    const keys = [...groups.flatMap((g) => [...(g.head ? [g.head] : []), ...g.lenses]), ...(isKam ? [] : SIDE_LENSES)];
    const out: Partial<Record<WorkLens, LensRow[]>> = {};
    for (const k of keys) {
      if (HEAD_UNION[k]) continue;
      const from = PERIOD_LENSES.includes(k) ? inPeriod : rows;
      out[k] = sortLens(k, from.filter((r) => lensMatches(k, r, ctx)), ctx);
    }
    for (const [head, parts] of Object.entries(HEAD_UNION) as [WorkLens, WorkLens[]][]) {
      if (!keys.includes(head)) continue;
      const seen = new Map<string, LensRow>();
      for (const p of parts) for (const r of out[p] ?? []) seen.set(r.lead.id, r);
      out[head] = sortLens(head, [...seen.values()], ctx);
    }
    return out;
  }, [rows, pipelineIds, groups, isKam, today, nowMs]);

  return { groups, lists };
}

'use client';

import { fmtINR } from '../../../models/mock-data';
import { orderVerified } from '../../../models/outreach/handover';
import { PoolLead } from '../../../models/outreach/intake';
import type { LensPill, LensTileGroup } from '../../../ui/lens-tiles';
import { DEAL_LENSES, LENS, SIDE_LENSES, TILE_LABEL } from '../constants';
import { LensGroup, LensRow, WorkLens } from '../types';

type Unknown = 'pending' | 'failed' | null;

interface Figure { value: string; sub?: string; warn?: boolean }

const day = (d: string | undefined) => String(d || '').slice(0, 10);

const newestValue = (rows: LensRow[] = []) =>
  rows.reduce((a, r) => a + ((r.deal.pis[0] ?? r.deal.carts[0])?.value || 0), 0);

function figures(lists: Partial<Record<WorkLens, LensRow[]>>, today: string, pool: PoolLead[] | null, unassigned: number): Partial<Record<WorkLens, Figure>> {
  const n = (k: WorkLens) => lists[k]?.length ?? 0;
  const v = (k: WorkLens) => String(n(k));
  const firstAt = (lists.meetings ?? [])
    .map((r) => (r.lead.meetings || []).find((m) => m.status === 'Scheduled' && day(m.date) === today)?.time)
    .filter(Boolean).sort()[0];
  const waiting = (k: WorkLens) => {
    const val = newestValue(lists[k]);
    return n(k) ? { value: v(k), sub: `${val ? `${fmtINR(val)} · ` : ''}no update yet`, warn: true } : { value: v(k), sub: 'none waiting' };
  };
  const following = (k: WorkLens) => {
    const due = (lists[k] ?? []).filter((r) => day(r.lead.followUpDate) && day(r.lead.followUpDate) <= today).length;
    return { value: v(k), sub: due ? `${due} due now` : n(k) ? 'booked ahead' : 'none yet', warn: due > 0 };
  };
  const unverified = (lists.won ?? []).filter((r) => !orderVerified(r.lead)).length;
  const lostNoReason = (lists.lost ?? []).filter((r) => !r.lead.lostReason).length;
  const pooled = pool === null ? null : pool.length + unassigned;
  return {
    meetings: { value: v('meetings'), sub: firstAt ? `first at ${firstAt}` : n('meetings') ? 'today' : 'none today' },
    overdue: { value: v('overdue'), sub: 'date passed', warn: n('overdue') > 0 },
    due: { value: v('due'), sub: 'booked for today' },
    book: { value: v('book'), sub: n('book') ? 'call to book' : 'all booked' },
    cartOpen: waiting('cartOpen'),
    piOpen: waiting('piOpen'),
    cartFollow: following('cartFollow'),
    piFollow: following('piFollow'),
    inbox: pooled === null
      ? { value: v('inbox'), sub: unassigned ? `${unassigned} unassigned · Inbound pool unknown` : 'Inbound pool unknown', warn: true }
      : { value: v('inbox'), sub: pooled ? `${pooled} unassigned` : 'to accept or reject' },
    handoff: { value: v('handoff'), sub: n('handoff') ? 'to send or chase' : 'all handed over', warn: n('handoff') > 0 },
    won: { value: v('won'), sub: unverified ? `${unverified} not verified` : 'in the period', warn: unverified > 0 },
    lost: lostNoReason ? { value: v('lost'), sub: `${lostNoReason} without a reason`, warn: true } : { value: v('lost'), sub: 'in the period' },
  };
}

export function outreachTiles({ groups, lists, today, pool, unassigned, leadsState, dealsState }: {
  groups: LensGroup[];
  lists: Partial<Record<WorkLens, LensRow[]>>;
  today: string;
  pool: PoolLead[] | null;
  unassigned: number;
  leadsState: Unknown;
  dealsState: Unknown;
}): LensTileGroup<WorkLens>[] {
  const figs = figures(lists, today, pool, unassigned);
  const count = (k: WorkLens) => lists[k]?.length ?? 0;
  return groups.map((g) => {
    const isDeals = !!g.head && DEAL_LENSES.includes(g.head);
    const unknown = leadsState ?? (isDeals ? dealsState : null);
    return {
      title: g.title,
      head: g.head ? { key: g.head, label: unknown ? g.title : `${g.title} · ${count(g.head)}`, rule: LENS[g.head].rule } : undefined,
      tiles: g.lenses.map((k) => {
        const fig = unknown === 'pending' ? { value: '…', sub: 'loading' }
          : unknown === 'failed' ? { value: 'Unknown', sub: isDeals ? 'carts did not load' : 'leads did not load' }
            : figs[k] ?? { value: String(count(k)), sub: '' };
        return { key: k, title: TILE_LABEL[k] ?? LENS[k].title, rule: `${LENS[k].title}: ${LENS[k].rule}`, accent: LENS[k].accent, ...fig, muted: !unknown && count(k) === 0 };
      }),
    };
  });
}

export const outreachPills = (lists: Partial<Record<WorkLens, LensRow[]>>, hideCounts: boolean): LensPill<WorkLens>[] =>
  SIDE_LENSES.map((k) => ({ key: k, title: LENS[k].title, rule: LENS[k].rule, count: hideCounts ? undefined : lists[k]?.length ?? 0 }));

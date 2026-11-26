'use client';

import { useMemo, useState } from 'react';
import { LensTileGroup, LensTiles } from '../../b2b/ui/lens-tiles';
import type { LeadView, Priority } from '@/lib/bda-retail/types';
import { QueueLens, calledToday, dialsOn, queueFor } from '@/lib/bda-retail/utils';
import { PageHead } from '../ui/chips';
import { LeadTable } from '../ui/lead-table';

const EMPTY: Record<QueueLens, string> = {
  due: 'No follow-ups due today.',
  retry: 'Nobody waiting for another try.',
  fresh: 'Nothing waiting in the plan\'s priorities. Fetch new leads on the Lead bank.',
  today: 'You have not logged a call today.',
};

export function QueueView({ views, phone, active, today, onOpen }: {
  views: LeadView[];
  phone: string;
  active: Priority[];
  today: string;
  onOpen: (l: LeadView) => void;
}) {
  const [lens, setLens] = useState<QueueLens>('due');
  const lists = useMemo(() => ({ ...queueFor(views, phone, active, today), today: calledToday(views, phone, today) }), [views, phone, active, today]);
  const next = lists.due[0] ?? lists.retry[0] ?? lists.fresh[0];
  const dials = useMemo(() => dialsOn(lists.today, phone, today), [lists.today, phone, today]);

  const groups: LensTileGroup<QueueLens>[] = [
    {
      title: 'Your calls',
      tiles: [
        { key: 'due', title: 'Follow-ups due', rule: 'Your leads whose follow-up date is today or earlier', accent: '#7C3AED', value: String(lists.due.length), warn: lists.due.length > 0, sub: lists.due.length ? 'Call these first' : 'All caught up' },
        { key: 'retry', title: 'Try again', rule: 'Your leads that did not connect on an earlier day', accent: '#D97706', value: String(lists.retry.length) },
        { key: 'fresh', title: 'Next up', rule: `Leads nobody has taken, in ${active.join(', ')}, highest priority first, newest first`, accent: '#2563EB', value: lists.fresh.length.toLocaleString('en-IN'), sub: `Priorities on: ${active.join(', ')}` },
        { key: 'today', title: 'Called today', rule: 'Leads you logged a call on today', accent: '#0F766E', value: String(lists.today.length), sub: `${dials} dials · plan about 110 a day` },
      ],
    },
  ];

  return (
    <div className="p-4 sm:p-6">
      <PageHead title="My queue" sub="Follow-ups due come first, then retries, then the newest lead in the highest priority. Opening a lead makes it yours.">
        <button
          disabled={!next}
          onClick={() => next && onOpen(next)}
          className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-40"
        >
          Call next lead
        </button>
      </PageHead>
      <LensTiles groups={groups} active={lens} onPick={setLens} />
      <LeadTable leads={lists[lens]} onOpen={onOpen} empty={EMPTY[lens]} resetKey={lens} />
    </div>
  );
}

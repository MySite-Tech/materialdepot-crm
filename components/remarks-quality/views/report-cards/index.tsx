'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Dataset, Filters, ScoreCtx } from '../../types';
import { DOW_LONG, addDays, dayOfWeek, dlabel, today } from '../../utils/dates';
import { bits, ptOf } from '../../utils/scoring';
import { EmptyState, NOTE, Seg } from '../../ui';
import { ReportCard } from './card';
import { buildCards, defaultCardDay, firstFullDays } from './utils';

export function ReportCardsView({ ds, filters, ctx, ensureTexts, textOf, onReset }: {
  ds: Dataset;
  filters: Filters;
  ctx: ScoreCtx;
  ensureTexts: (ids: number[]) => void;
  textOf: (id: number) => string | null | undefined;
  onReset: () => void;
}) {
  const [day, setDay] = useState(() => defaultCardDay(ds, filters));
  const [skipDone, setSkipDone] = useState(true);
  const done4 = useMemo(() => firstFullDays(ds, ctx), [ds, ctx]);
  const cards = useMemo(() => buildCards(ds, filters, ctx, day, skipDone ? done4 : null), [ds, filters, ctx, day, skipDone, done4]);

  const bestIds = cards.filter(c => c.best && bits(ptOf(c.best, ctx)) >= 2).map(c => c.best!.id);
  const bestKey = bestIds.join(',');
  useEffect(() => { if (bestKey) ensureTexts(bestKey.split(',').map(Number)); }, [bestKey, ensureTexts]);

  const yesterday = addDays(today(), -1);
  const quick = day === yesterday ? 'y' : day === today() ? 't' : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Day</span>
        <Seg value={quick as 'y' | 't'} onChange={v => setDay(v === 'y' ? yesterday : today())} options={[['y', 'Yesterday'], ['t', 'Today so far']]} />
        <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)}
          aria-label="Report card day" className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px]" />
        <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer"
          title="If a lead already got a remark covering all 4 pointers on an earlier day, its later follow-ups are not scored">
          <input type="checkbox" checked={skipDone} onChange={e => setSkipDone(e.target.checked)} className="accent-amber-500" /> Skip leads already covered 4/4 earlier
        </label>
        <span className={NOTE}>
          {DOW_LONG[dayOfWeek(day)]} · {cards.length} Experience Centres · ranked on remarks filled and remarks quality · filters at the top apply to quality only
        </span>
      </div>
      {!cards.length && (
        <EmptyState title={`No remarks match these filters on ${dlabel(day)}`} sub="Pick another day, or reset the filters." onReset={onReset} />
      )}
      <div className="grid gap-4 items-start grid-cols-[repeat(auto-fill,minmax(min(440px,100%),1fr))]">
        {cards.map(c => (
          <ReportCard key={c.br} c={c} total={cards.length} day={day} dicts={ds.dicts} ctx={ctx}
            bestText={c.best ? textOf(c.best.id) : undefined} />
        ))}
      </div>
      <p className={NOTE}>
        Score = how many of the 4 pointers (Need / Stuck / Who / Next + date) a lead&apos;s best remark that day covered, averaged over the leads the EC updated.
        Bars on the right = last 7 days. Remarks filled = of the customers who walked into the store that day (with a cart), how many got a typed remark on their lead the same day; BM = lead owner.
        Remarks quality rank = by avg score. Cards are ordered by the two ranks combined. ★ / NEEDS PUSH = best / lowest BM on filled × quality (3+ leads).
        New leads = leads that got their first-ever remark that day; Follow-ups = leads that already had remarks before.
        With &quot;Skip leads already covered 4/4 earlier&quot; on, a lead that got a single remark covering all 4 on an earlier day is left out of later days, shown as &quot;+N done earlier&quot;.
      </p>
    </div>
  );
}

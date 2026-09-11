'use client';

import { useMemo } from 'react';
import { HISTORY_DAYS } from '@/lib/store-checklist/constants';
import type { ChecklistDay } from '@/lib/store-checklist/types';
import { CHECKLIST_ITEM_TOTAL, dayProgress, emptyDay, issuesFor, istToday, recentDates, storeLabel } from '@/lib/store-checklist/utils';
import { useChecklistRange } from '../hooks/use-checklist-range';
import { Notice, StatCard } from '../ui/bits';
import { IssuesList } from './issues';

const cellKey = (storeCode: string, date: string) => `${storeCode}|${date}`;

export function ChecklistCompliance({ storeCodes, onOpenDay }: {
  storeCodes: string[];
  onOpenDay: (storeCode: string, date: string) => void;
}) {
  const today = istToday();
  const dates = useMemo(() => recentDates(HISTORY_DAYS, today), [today]);
  const from = dates[dates.length - 1];
  const { days, loading, error, reload } = useChecklistRange(storeCodes, from, today);

  const byCell = useMemo(() => {
    const map = new Map<string, ChecklistDay>();
    for (const day of days ?? []) map.set(cellKey(day.storeCode, day.date), day);
    return map;
  }, [days]);

  const issues = useMemo(() => (days ?? []).flatMap(issuesFor), [days]);

  const totals = useMemo(() => {
    const completeToday = storeCodes.filter((code) => {
      const day = byCell.get(cellKey(code, today));
      return day ? dayProgress(day.items).complete : false;
    }).length;
    const startedToday = storeCodes.filter((code) => {
      const day = byCell.get(cellKey(code, today));
      return day ? dayProgress(day.items).answered > 0 : false;
    }).length;
    const noWithoutNote = issues.filter((i) => !i.comment).length;
    return { completeToday, startedToday, noWithoutNote };
  }, [byCell, issues, storeCodes, today]);

  if (error) {
    return (
      <div className="p-6 flex flex-col gap-3 items-start">
        <Notice tone="red">
          <strong>Could not load checklist history.</strong>
          <br />
          {error}
          <br />
          No compliance numbers are shown rather than showing zeros that would read as &quot;nobody marked anything&quot;.
        </Notice>
        <button
          type="button"
          onClick={reload}
          className="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-[12.5px] font-semibold text-gray-600 cursor-pointer hover:border-gray-300"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading && !days) {
    return <div className="p-6 text-[13px] text-gray-400">Loading the last {HISTORY_DAYS}{' '}days…</div>;
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Complete today"
          value={`${totals.completeToday}/${storeCodes.length}`}
          hint={`all ${CHECKLIST_ITEM_TOTAL} items marked`}
          tone={totals.completeToday === storeCodes.length ? 'good' : 'warn'}
        />
        <StatCard
          label="Not started today"
          value={String(storeCodes.length - totals.startedToday)}
          hint="no mark yet"
          tone={storeCodes.length - totals.startedToday > 0 ? 'bad' : 'good'}
        />
        <StatCard label="Marked No" value={String(issues.length)} hint={`last ${HISTORY_DAYS} days`} tone={issues.length > 0 ? 'warn' : 'good'} />
        <StatCard label="No without a note" value={String(totals.noWithoutNote)} hint="nothing to act on" tone={totals.noWithoutNote > 0 ? 'warn' : 'good'} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="text-[13px] font-bold text-gray-800">Marked / not marked</span>
          <span className="text-[11px] text-gray-400">items answered out of {CHECKLIST_ITEM_TOTAL}{' '}· tap a cell to open that day</span>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 sticky left-0 bg-white">Store</th>
                {dates.map((d) => (
                  <th key={d} className="px-1.5 py-2 text-center text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                    {d.slice(8)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {storeCodes.map((code) => (
                <tr key={code} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-3 py-2 text-[12.5px] font-semibold text-gray-700 whitespace-nowrap sticky left-0 bg-white">
                    {storeLabel(code)}
                  </td>
                  {dates.map((d) => {
                    const day = byCell.get(cellKey(code, d)) ?? emptyDay(code, d);
                    const p = dayProgress(day.items);
                    const tone = p.complete
                      ? 'bg-emerald-50 text-emerald-700'
                      : p.answered > 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-50 text-gray-300';
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => onOpenDay(code, d)}
                          title={`${storeLabel(code)} · ${d} · ${p.answered}/${p.total} marked${p.no ? `, ${p.no} No` : ''}`}
                          className={`w-full min-w-[34px] rounded px-1 py-1 text-[11px] font-semibold tabular-nums cursor-pointer border-0 ${tone}`}
                        >
                          {p.answered === 0 ? '—' : p.complete ? '✓' : p.answered}
                          {p.no > 0 && <span className="block text-[9px] font-bold text-red-500 leading-none">{p.no}{' '}No</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <IssuesList issues={issues} onOpenDay={onOpenDay} />
    </div>
  );
}

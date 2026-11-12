'use client';

import { ActivityItem, ActivityKind } from '../../../models/performance/types';
import { Pager } from '../../kams/ui';
import { PAGE_SIZE } from '../constants';
import { fmtDay } from '../utils';
import { useEffect, useMemo, useState } from 'react';

const KIND_TONE: Record<ActivityKind, string> = {
  Call: 'bg-sky-50 text-sky-800 border-sky-200',
  Meeting: 'bg-violet-50 text-violet-800 border-violet-200',
  Note: 'bg-gray-50 text-gray-700 border-gray-200',
  'EC redirect': 'bg-pink-50 text-pink-800 border-pink-200',
  'Sent to Outreach': 'bg-teal-50 text-teal-800 border-teal-200',
  'Lead update': 'bg-amber-50 text-amber-800 border-amber-200',
  Enquiry: 'bg-indigo-50 text-indigo-800 border-indigo-200',
};

const istDayOf = (at: string) => (at.length <= 10 ? at : new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
const istTime = (at: string) => (at.length <= 10 ? '' : new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }));

export function ActivityPanel({ items, who, notes }: { items: ActivityItem[]; who: string; notes: string[] }) {
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const [page, setPage] = useState(0);
  const counts = useMemo(() => {
    const m = new Map<ActivityKind, number>();
    for (const i of items) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = useMemo(() => (kind === 'all' ? items : items.filter((i) => i.kind === kind)), [items, kind]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [kind, items]);
  useEffect(() => { if (kind !== 'all' && !counts.some(([k]) => k === kind)) setKind('all'); }, [counts, kind]);

  const slice = shown.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);
  const days = slice.reduce<{ day: string; items: ActivityItem[] }[]>((acc, i) => {
    const day = istDayOf(i.at);
    const last = acc[acc.length - 1];
    if (last?.day === day) last.items.push(i); else acc.push({ day, items: [i] });
    return acc;
  }, []);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-[14px] font-bold text-gray-900">Everything logged · {who}</h2>
          <span className="text-[11.5px] text-gray-400 tabular-nums">{items.length} entr{items.length === 1 ? 'y' : 'ies'} in the period</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          <button onClick={() => setKind('all')}
            className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-full border cursor-pointer ${kind === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            All <span className="tabular-nums opacity-70">{items.length}</span>
          </button>
          {counts.map(([k, n]) => (
            <button key={k} onClick={() => setKind(kind === k ? 'all' : k)}
              className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-full border cursor-pointer ${kind === k ? 'bg-gray-900 text-white border-gray-900' : `${KIND_TONE[k]} hover:brightness-95`}`}>
              {k} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>
      </div>
      {days.length ? (
        <ol className="px-5 py-3 flex flex-col gap-4">
          {days.map(({ day, items: list }) => (
            <li key={day}>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{fmtDay(day, true)}</div>
              <ul className="flex flex-col divide-y divide-gray-50 border-l-2 border-gray-100 pl-3">
                {list.map((i) => (
                  <li key={i.id} className="py-1.5 flex items-start gap-2.5 min-w-0">
                    <span className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums pt-0.5">{istTime(i.at)}</span>
                    <span className={`shrink-0 text-[10px] font-semibold border rounded px-1.5 py-px ${KIND_TONE[i.kind]}`}>{i.kind}</span>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-gray-800 truncate">{i.title}</div>
                      <div className="text-[11.5px] text-gray-500 break-words line-clamp-2">{i.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-5 py-8 text-center text-[12px] text-gray-400">Nothing logged in this period.</p>
      )}
      {shown.length > PAGE_SIZE && <Pager total={shown.length} page={cur} pages={pages} size={PAGE_SIZE} setPage={setPage} />}
      {!!notes.length && (
        <div className="px-5 py-2.5 border-t border-gray-100 text-[11px] text-gray-400">{notes.join(' ')}</div>
      )}
    </section>
  );
}

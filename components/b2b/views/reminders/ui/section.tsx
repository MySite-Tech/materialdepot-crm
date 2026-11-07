'use client';

import { useEffect, useState } from 'react';
import { Reminder } from '../../../models/reminders';
import { REMINDER_PAGE_SIZE } from '../constants';
import { ReminderRow } from './row';

const pageBtn = 'px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40';

export function ReminderSection({ title, rule, list, nowMs, showOwner, onOpen, empty, accent, resetKey }: {
  title: string;
  rule: string;
  list: Reminder[];
  nowMs: number;
  showOwner: boolean;
  onOpen: (r: Reminder) => void;
  empty?: string;
  accent?: string;
  resetKey: string;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  if (!list.length && !empty) return null;

  const pages = Math.max(1, Math.ceil(list.length / REMINDER_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = list.slice(cur * REMINDER_PAGE_SIZE, (cur + 1) * REMINDER_PAGE_SIZE);

  return (
    <section className="bg-white rounded-lg border border-gray-200 mb-3 overflow-hidden" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
      <header className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-3 flex-wrap border-b border-gray-100">
        <h3 className="text-[13px] font-bold text-gray-900">
          {title} <span className="text-gray-400 font-semibold">{list.length}</span>
        </h3>
        <p className="text-[11px] text-gray-400">{rule}</p>
      </header>
      {list.length === 0
        ? <p className="px-4 py-4 text-[12px] text-gray-400">{empty}</p>
        : (
          <ol className="divide-y divide-gray-100">
            {visible.map((r) => <ReminderRow key={r.key} r={r} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen} />)}
          </ol>
        )}
      {list.length > REMINDER_PAGE_SIZE && (
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-t border-gray-100">
          <span className="text-[11px] text-gray-500">
            Showing {cur * REMINDER_PAGE_SIZE + 1}–{Math.min(list.length, (cur + 1) * REMINDER_PAGE_SIZE)} of {list.length}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className={pageBtn}>← Prev</button>
            <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={pageBtn}>Next →</button>
          </div>
        </div>
      )}
    </section>
  );
}

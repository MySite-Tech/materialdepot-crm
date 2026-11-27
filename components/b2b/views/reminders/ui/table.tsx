'use client';

import { useEffect, useState } from 'react';
import { Reminder } from '../../../models/reminders';
import { REMINDER_PAGE_SIZE } from '../constants';
import { ReminderRow } from './row';

const pageBtn = 'h-8 px-3 text-[13px] border border-gray-200 rounded-md bg-white text-gray-700 disabled:opacity-40';
const th = 'px-3 py-2.5 text-left text-[12px] font-normal text-gray-500';

export function ReminderTable({ list, nowMs, showOwner, onOpen, empty, resetKey }: {
  list: Reminder[];
  nowMs: number;
  showOwner: boolean;
  onOpen: (r: Reminder) => void;
  empty: string;
  resetKey: string;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);

  if (!list.length) return <p className="px-5 py-12 text-center text-[13px] text-gray-500">{empty}</p>;

  const pages = Math.ceil(list.length / REMINDER_PAGE_SIZE);
  const cur = Math.min(page, pages - 1);
  const visible = list.slice(cur * REMINDER_PAGE_SIZE, (cur + 1) * REMINDER_PAGE_SIZE);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/60">
            <tr>
              <th className={`${th} pl-5 w-[150px]`}>When</th>
              <th className={th}>Client</th>
              <th className={`${th} w-[170px]`}>Team and type</th>
              {showOwner && <th className={`${th} w-[140px]`}>Owner</th>}
              <th className={th}>Latest note</th>
              <th className={`${th} pr-5 w-[80px]`}><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => <ReminderRow key={r.key} r={r} nowMs={nowMs} showOwner={showOwner} onOpen={onOpen} />)}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-gray-100">
          <span className="text-[12px] text-gray-500 tabular-nums">
            Showing {cur * REMINDER_PAGE_SIZE + 1}–{Math.min(list.length, (cur + 1) * REMINDER_PAGE_SIZE)} of {list.length}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className={pageBtn}>Previous</button>
            <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={pageBtn}>Next</button>
          </div>
        </div>
      )}
    </>
  );
}

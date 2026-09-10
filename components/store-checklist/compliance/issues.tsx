'use client';

import { useEffect, useState } from 'react';
import { CHECKLIST_SECTIONS } from '@/lib/store-checklist/constants';
import type { ChecklistIssue } from '@/lib/store-checklist/types';
import { storeLabel } from '@/lib/store-checklist/utils';

const PAGE_SIZE = 25;

const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  CHECKLIST_SECTIONS.map((s) => [s.key, s.label]),
);

export function IssuesList({ issues, onOpenDay }: {
  issues: ChecklistIssue[];
  onOpenDay: (storeCode: string, date: string) => void;
}) {
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [issues]);

  if (issues.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3.5 py-6 text-center text-[12.5px] text-gray-400">
        Nothing marked No in this window.
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = issues.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const first = current * PAGE_SIZE + 1;
  const last = current * PAGE_SIZE + rows.length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <span className="text-[13px] font-bold text-gray-800">Marked No</span>
        <span className="text-[11px] text-gray-400">what a store said is not in order</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-white border-b border-gray-100">
              {['Date', 'Store', 'Section', 'Item', 'Note', 'Marked by'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr
                key={`${issue.storeCode}|${issue.date}|${issue.itemId}`}
                onClick={() => onOpenDay(issue.storeCode, issue.date)}
                className="border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50"
              >
                <td className="px-3 py-2 text-[12.5px] text-gray-600 whitespace-nowrap">{issue.date}</td>
                <td className="px-3 py-2 text-[12.5px] font-semibold text-gray-700 whitespace-nowrap">{storeLabel(issue.storeCode)}</td>
                <td className="px-3 py-2 text-[12px] text-gray-500 whitespace-nowrap">{SECTION_LABELS[issue.sectionKey] ?? issue.sectionKey}</td>
                <td className="px-3 py-2 text-[12.5px] text-gray-700">{issue.label}</td>
                <td className={`px-3 py-2 text-[12.5px] ${issue.comment ? 'text-gray-600' : 'text-amber-600 font-semibold'}`}>
                  {issue.comment || 'No note'}
                </td>
                <td className="px-3 py-2 text-[12px] text-gray-500 whitespace-nowrap">{issue.by || 'unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3.5 py-2.5 border-t border-gray-100 flex items-center gap-3">
        <span className="text-[11.5px] text-gray-400 tabular-nums">Showing {first}–{last}{' '}of {issues.length}</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="px-2.5 py-1 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="px-2.5 py-1 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

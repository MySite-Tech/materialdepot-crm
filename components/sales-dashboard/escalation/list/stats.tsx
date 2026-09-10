'use client';

import { StatusFilter } from '../types';
import { Dispatch, SetStateAction } from 'react';

export function EscalationStats({ activeStatusFilter, setActiveStatusFilter, statusCounts, totalElements }: {
  activeStatusFilter: StatusFilter;
  setActiveStatusFilter: Dispatch<SetStateAction<StatusFilter>>;
  statusCounts: { all: number; open: number; waiting: number; resolved: number; };
  totalElements: number;
}) {
  return (
    <div className="flex gap-3 mb-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {([
        { value: "all" as StatusFilter, label: "All", count: totalElements },
        { value: "open" as StatusFilter, label: "Open", count: statusCounts.open },
        { value: "waiting" as StatusFilter, label: "Waiting", count: statusCounts.waiting },
        { value: "resolved" as StatusFilter, label: "Resolved", count: statusCounts.resolved },
      ]).map((chip) => (
        <button
          key={chip.value}
          onClick={() => setActiveStatusFilter(chip.value)}
          className={`shrink-0 text-xs font-semibold pb-1 transition-colors ${
            activeStatusFilter === chip.value
              ? "text-gray-900 border-b-2 border-yellow-400"
              : "text-gray-400"
          }`}
        >
          {chip.label}
          {activeStatusFilter === chip.value && <span className="ml-1">({chip.count})</span>}
        </button>
      ))}
    </div>
  );
}

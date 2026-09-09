'use client';

import { DATE_CHIPS } from '../constants/escalation';
import { DateFilter } from '../types/escalation';

export function EscalationFilters({ activeDateFilter, handleDateChip }: {
  activeDateFilter: DateFilter;
  handleDateChip: (chip: DateFilter) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1 scrollbar-hide">
      {DATE_CHIPS.map((chip) => (
        <button
          key={chip.value}
          onClick={() => handleDateChip(chip.value)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            activeDateFilter === chip.value
              ? "bg-[#EAB308] text-gray-950"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
